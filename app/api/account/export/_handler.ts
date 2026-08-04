import { NextRequest, NextResponse } from "next/server";

import { AccountDataExportError, PostgresAccountDataExportService, type AccountDataExport } from "@/features/account-data-export/account-data-export-service";
import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError, safeDatabaseErrorLog } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import { accountDeletionSessionIsFresh } from "../deletion/_handler";
import { blockedHighRiskResponse } from "@/features/understanding-assistance/understanding-assistance";
import { defaultUnderstandingAssistanceGuard, UnderstandingAssistanceError, type UnderstandingAssistanceGuard } from "@/features/understanding-assistance/understanding-assistance-postgres";

type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type CreateExport = (input: { userId: string; externalUserId: string }) => Promise<AccountDataExport>;

const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

export function accountDataExportRuntimeEnabled(): boolean {
  return process.env.ACCOUNT_DATA_EXPORT_ENABLED === "true" && process.env.AUTH_SESSION_REVOCATION_ENFORCED === "true";
}

function failure(error: unknown): NextResponse {
  if (error instanceof UnderstandingAssistanceError) {
    return error.code === "UNDERSTANDING_ASSISTANCE_REQUIRED"
      ? json(blockedHighRiskResponse("account_export"), { status: 409 })
      : json({ error: error.code }, { status: error.code === "ACCOUNT_NOT_FOUND" ? 404 : 409 });
  }
  if (error instanceof AccountDataExportError) return json({ error: error.code }, { status: error.code === "ACCOUNT_NOT_FOUND" ? 404 : 409 });
  if (error instanceof DatabaseDependencyError) {
    console.error("[api:account-export] database request failed", safeDatabaseErrorLog(error));
    return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  console.error("[api:account-export] request failed");
  return json({ error: "ACCOUNT_DATA_EXPORT_FAILED" }, { status: 500 });
}

export function createAccountDataExportHandler(
  service: Pick<PostgresAccountDataExportService, "create"> = new PostgresAccountDataExportService(),
  sessionResolver: SessionResolver = verifyRequestSession,
  assistanceGuard: UnderstandingAssistanceGuard = defaultUnderstandingAssistanceGuard(),
) {
  const create: CreateExport = (input) => service.create(input);
  return {
    async POST(request: NextRequest): Promise<NextResponse> {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        if (!accountDataExportRuntimeEnabled()) return json({ error: "ACCOUNT_DATA_EXPORT_UNAVAILABLE" }, { status: 503 });
        if (!accountDeletionSessionIsFresh(session)) return json({ error: "REAUTH_REQUIRED" }, { status: 403 });
        await assistanceGuard.assertHighRiskAllowed({ userId: session.userId, externalUserId: session.externalUserId, operation: "account_export" });
        const body = await create({ userId: session.userId, externalUserId: session.externalUserId });
        return applyAuthNoStore(new NextResponse(JSON.stringify(body), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": "attachment; filename=memoryai-account-data-export.json",
            "X-Content-Type-Options": "nosniff",
          },
        }));
      } catch (error) { return failure(error); }
    },
  };
}
