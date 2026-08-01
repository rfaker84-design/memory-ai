import { NextRequest, NextResponse } from "next/server";

import { AccountDeletionError, PostgresAccountDeletionService } from "@/features/account-deletion/account-deletion-service";
import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError, safeDatabaseErrorLog } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import { accountDeletionSessionIsFresh, deletionRuntimeEnabled } from "../_handler";

type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type GuardianConfirmation = (input: { dependentUserId: string; guardianUserId: string; guardianExternalUserId: string }) => Promise<void>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

function dependentId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 2 && body.confirmation === "CONFIRM_GUARDIAN_ACCOUNT_DELETION" && typeof body.dependentUserId === "string" && uuid.test(body.dependentUserId) ? body.dependentUserId : null;
}

function failure(error: unknown) {
  if (error instanceof AccountDeletionError) return json({ error: error.code }, { status: error.code === "ACCOUNT_NOT_FOUND" ? 404 : 409 });
  if (error instanceof DatabaseDependencyError) {
    console.error("[api:account-deletion-guardian] database request failed", safeDatabaseErrorLog(error));
    return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  console.error("[api:account-deletion-guardian] request failed");
  return json({ error: "GUARDIAN_CONFIRMATION_FAILED" }, { status: 500 });
}

/** A guardian must hold the freshly reauthenticated session tied to the protected dependent profile. */
export function createGuardianDeletionConfirmationHandler(
  service: Pick<PostgresAccountDeletionService, "confirmGuardian"> = new PostgresAccountDeletionService(),
  sessionResolver: SessionResolver = verifyRequestSession,
) {
  const confirm: GuardianConfirmation = (input) => service.confirmGuardian(input);
  return {
    async POST(request: NextRequest) {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        if (!deletionRuntimeEnabled()) return json({ error: "ACCOUNT_DELETION_UNAVAILABLE" }, { status: 503 });
        if (!accountDeletionSessionIsFresh(session)) return json({ error: "REAUTH_REQUIRED" }, { status: 403 });
        const id = dependentId(await request.json().catch(() => null));
        if (!id) return json({ error: "INVALID_GUARDIAN_CONFIRMATION" }, { status: 400 });
        await confirm({ dependentUserId: id, guardianUserId: session.userId, guardianExternalUserId: session.externalUserId });
        return json({ accepted: true }, { status: 202 });
      } catch (error) { return failure(error); }
    },
  };
}
