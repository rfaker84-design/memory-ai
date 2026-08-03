import { NextRequest, NextResponse } from "next/server";

import { isAtLeast18, isIsoCalendarDate } from "@/features/account-profile/adult-eligibility";
import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError, safeDatabaseErrorLog, withPostgresTransaction } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Profile = { birthDate: string | null; adultEligible: boolean };
type ProfileService = {
  read(externalUserId: string): Promise<Profile>;
  updateBirthDate(externalUserId: string, birthDate: string): Promise<Profile>;
};
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;

const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

const profileService: ProfileService = {
  async read(externalUserId) {
    return withPostgresTransaction(async (client) => {
      const result = await client.query<{ birth_date: string | null }>(
        `SELECT profile ->> 'birth_date' AS birth_date FROM public.users WHERE external_id=$1 LIMIT 1`,
        [externalUserId],
      );
      const birthDate = result.rows[0]?.birth_date ?? null;
      return { birthDate, adultEligible: birthDate ? isAtLeast18(birthDate) : false };
    });
  },
  async updateBirthDate(externalUserId, birthDate) {
    return withPostgresTransaction(async (client) => {
      const result = await client.query<{ birth_date: string }>(
        `INSERT INTO public.users (external_id, profile)
         VALUES ($1, jsonb_build_object('birth_date', $2))
         ON CONFLICT (external_id) DO UPDATE
           SET profile = jsonb_set(COALESCE(public.users.profile, '{}'::jsonb), '{birth_date}', to_jsonb($2::text), true),
               updated_at = NOW()
         RETURNING profile ->> 'birth_date' AS birth_date`,
        [externalUserId, birthDate],
      );
      const saved = result.rows[0]?.birth_date;
      if (!saved) throw new Error("PROFILE_UPDATE_UNAVAILABLE");
      return { birthDate: saved, adultEligible: isAtLeast18(saved) };
    });
  },
};

function parseBirthDate(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).join(",") !== "birthDate" || typeof body.birthDate !== "string") return null;
  return body.birthDate;
}

function failure(error: unknown) {
  if (error instanceof DatabaseDependencyError) {
    console.error("[api:account-profile] database request failed", safeDatabaseErrorLog(error));
    return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof AuthConfigurationError) {
    return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  }
  console.error("[api:account-profile] request failed");
  return json({ error: "PROFILE_REQUEST_FAILED" }, { status: 500 });
}

export function createAccountProfileHandlers(
  service: ProfileService = profileService,
  sessionResolver: SessionResolver = verifyRequestSession,
) {
  return {
    async GET(request: NextRequest) {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        return json(await service.read(session.externalUserId));
      } catch (error) {
        return failure(error);
      }
    },
    async PATCH(request: NextRequest) {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        const birthDate = parseBirthDate(await request.json().catch(() => null));
        if (!birthDate) return json({ error: "INVALID_PROFILE_REQUEST" }, { status: 400 });
        if (!isIsoCalendarDate(birthDate)) return json({ error: "INVALID_BIRTH_DATE" }, { status: 400 });
        return json(await service.updateBirthDate(session.externalUserId, birthDate));
      } catch (error) {
        return failure(error);
      }
    },
  };
}
