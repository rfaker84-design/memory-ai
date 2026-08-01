import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { AccountDeletionError, ACCOUNT_DELETION_CONFIRMATION, PostgresAccountDeletionService, type AccountDeletionProgress } from "@/features/account-deletion/account-deletion-service";
import { AuthConfigurationError, clearSessionCookie, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError, safeDatabaseErrorLog } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const FRESH_REAUTH_MS = 5 * 60 * 1000;
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type RequestDeletion = (input: { userId: string; externalUserId: string; receiptToken: string }) => Promise<AccountDeletionProgress>;
type GetProgress = (input: { userId: string; externalUserId: string }) => Promise<AccountDeletionProgress | null>;
type GetProgressByReceipt = (receiptToken: string) => Promise<AccountDeletionProgress | null>;
const RECEIPT_COOKIE = "memoryai_deletion_receipt";
const RECEIPT_TTL_SECONDS = 90 * 24 * 60 * 60;

const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

export function deletionRuntimeEnabled(): boolean {
  return process.env.ACCOUNT_DELETION_ENABLED === "true" && process.env.AUTH_SESSION_REVOCATION_ENFORCED === "true";
}

export function accountDeletionSessionIsFresh(session: AuthSession): boolean {
  if (!session.authenticatedAt) return false;
  const authenticatedAt = Date.parse(session.authenticatedAt);
  return Number.isFinite(authenticatedAt) && authenticatedAt <= Date.now() + 30_000 && Date.now() - authenticatedAt <= FRESH_REAUTH_MS;
}

function parseConfirmation(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1 && body.confirmation === ACCOUNT_DELETION_CONFIRMATION;
}

function issueReceiptToken(): string {
  return randomBytes(32).toString("base64url");
}

function setReceiptCookie(response: NextResponse, token: string): void {
  response.cookies.set({ name: RECEIPT_COOKIE, value: token, secure: true, httpOnly: true, sameSite: "lax", path: "/api/account/deletion", maxAge: RECEIPT_TTL_SECONDS });
}

function failure(error: unknown) {
  if (error instanceof AccountDeletionError) return json({ error: error.code }, { status: error.code === "ACCOUNT_NOT_FOUND" ? 404 : 409 });
  if (error instanceof DatabaseDependencyError) {
    console.error("[api:account-deletion] database request failed", safeDatabaseErrorLog(error));
    return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  console.error("[api:account-deletion] request failed");
  return json({ error: "ACCOUNT_DELETION_FAILED" }, { status: 500 });
}

export function createAccountDeletionHandler(
  service: Pick<PostgresAccountDeletionService, "request" | "getProgress" | "getProgressByReceipt"> = new PostgresAccountDeletionService(),
  sessionResolver: SessionResolver = verifyRequestSession,
) {
  const requestDeletion: RequestDeletion = (input) => service.request(input);
  const getProgress: GetProgress = (input) => service.getProgress(input);
  const getProgressByReceipt: GetProgressByReceipt = (token) => service.getProgressByReceipt(token);
  return {
    async POST(request: NextRequest) {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        if (!deletionRuntimeEnabled()) return json({ error: "ACCOUNT_DELETION_UNAVAILABLE" }, { status: 503 });
        if (!accountDeletionSessionIsFresh(session)) return json({ error: "REAUTH_REQUIRED" }, { status: 403 });
        if (!parseConfirmation(await request.json().catch(() => null))) return json({ error: "INVALID_DELETION_CONFIRMATION" }, { status: 400 });
        const receiptToken = issueReceiptToken();
        const progress = await requestDeletion({ userId: session.userId, externalUserId: session.externalUserId, receiptToken });
        const response = json({ deletion: progress }, { status: 202 });
        clearSessionCookie(response);
        setReceiptCookie(response, receiptToken);
        return response;
      } catch (error) { return failure(error); }
    },
    async GET(request: NextRequest) {
      try {
        const session = await sessionResolver(request);
        const receiptToken = request.cookies.get(RECEIPT_COOKIE)?.value;
        const progress = session
          ? await getProgress({ userId: session.userId, externalUserId: session.externalUserId })
          : receiptToken ? await getProgressByReceipt(receiptToken) : null;
        if (!session && !receiptToken) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        return json({ deletion: progress });
      } catch (error) { return failure(error); }
    },
  };
}
