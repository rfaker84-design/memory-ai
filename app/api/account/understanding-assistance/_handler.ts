import { NextRequest, NextResponse } from "next/server";

import { type UnderstandingAssistanceGuard, PostgresUnderstandingAssistanceService, UnderstandingAssistanceError } from "@/features/understanding-assistance/understanding-assistance-postgres";
import { UNDERSTANDING_ASSISTANCE_VERSION } from "@/features/understanding-assistance/understanding-assistance";
import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError, safeDatabaseErrorLog } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const REQUEST_KEY = /^[A-Za-z0-9._:-]{16,128}$/;
const ENABLE_CONFIRMATION = "ENABLE_UNDERSTANDING_ASSISTANCE";
const REVOKE_CONFIRMATION = "REVOKE_UNDERSTANDING_ASSISTANCE";
type Service = UnderstandingAssistanceGuard & Pick<PostgresUnderstandingAssistanceService, "read" | "enable" | "revoke">;
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

function failure(error: unknown) {
  if (error instanceof UnderstandingAssistanceError) return json({ error: error.code }, { status: error.code === "ACCOUNT_NOT_FOUND" ? 404 : 409 });
  if (error instanceof DatabaseDependencyError) {
    console.error("[api:understanding-assistance] database request failed", safeDatabaseErrorLog(error));
    return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? error.code : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  console.error("[api:understanding-assistance] request failed");
  return json({ error: "UNDERSTANDING_ASSISTANCE_UNAVAILABLE" }, { status: 503 });
}

function isEnable(value: unknown): value is Record<string, string> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).sort().join(",") === "confirmation,confirmationVersion"
    && (value as Record<string, unknown>).confirmation === ENABLE_CONFIRMATION
    && (value as Record<string, unknown>).confirmationVersion === UNDERSTANDING_ASSISTANCE_VERSION;
}

function isRevoke(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).join(",") === "confirmation"
    && (value as Record<string, unknown>).confirmation === REVOKE_CONFIRMATION;
}

export function createUnderstandingAssistanceHandler(
  service: Service = new PostgresUnderstandingAssistanceService(),
  sessionResolver: SessionResolver = verifyRequestSession,
) {
  return {
    async GET(request: NextRequest) {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        return json(await service.read({ userId: session.userId, externalUserId: session.externalUserId }));
      } catch (error) { return failure(error); }
    },
    async POST(request: NextRequest) {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        const requestKey = request.headers.get("idempotency-key");
        if (!requestKey || !REQUEST_KEY.test(requestKey)) return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
        if (!isEnable(await request.json().catch(() => null))) return json({ error: "INVALID_UNDERSTANDING_ASSISTANCE_REQUEST" }, { status: 400 });
        return json(await service.enable({ userId: session.userId, externalUserId: session.externalUserId, requestKey }));
      } catch (error) { return failure(error); }
    },
    async DELETE(request: NextRequest) {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        if (!isRevoke(await request.json().catch(() => null))) return json({ error: "INVALID_UNDERSTANDING_ASSISTANCE_REQUEST" }, { status: 400 });
        return json(await service.revoke({ userId: session.userId, externalUserId: session.externalUserId }));
      } catch (error) { return failure(error); }
    },
  };
}

