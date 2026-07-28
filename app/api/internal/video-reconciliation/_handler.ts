import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import type { FirstPresenceUncertainReconciliationService } from "@/features/video";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type ReconciliationService = Pick<FirstPresenceUncertainReconciliationService, "reconcile">;
const TOKEN_HEADER = "x-video-reconciliation-access-token";
const ACCOUNT_HEADER = "x-video-reconciliation-account";
const MINIMUM_TOKEN_BYTES = 48;
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_PATTERN = /^[-A-Za-z0-9._:]{16,128}$/;
const PROVIDER_TASK_PATTERN = /^[-A-Za-z0-9._:]{1,256}$/;

const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

function authorized(request: NextRequest): { ok: true; operatorAccount: string } | { ok: false } {
  if (process.env.YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED !== "true") return { ok: false };
  const expectedToken = process.env.YIJIAN_VIDEO_RECONCILIATION_ACCESS_TOKEN;
  const expectedAccount = process.env.YIJIAN_VIDEO_RECONCILIATION_ACCOUNT;
  const suppliedToken = request.headers.get(TOKEN_HEADER);
  const suppliedAccount = request.headers.get(ACCOUNT_HEADER);
  if (
    !expectedToken
    || expectedToken !== expectedToken.trim()
    || Buffer.byteLength(expectedToken, "utf8") < MINIMUM_TOKEN_BYTES
    || !expectedAccount
    || !suppliedToken
    || suppliedAccount !== expectedAccount
  ) return { ok: false };
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return { ok: false };
  return { ok: true, operatorAccount: suppliedAccount };
}

function invalidBody(input: Record<string, unknown>): boolean {
  if (
    typeof input.jobId !== "string"
    || !JOB_ID_PATTERN.test(input.jobId)
    || typeof input.idempotencyKey !== "string"
    || !KEY_PATTERN.test(input.idempotencyKey)
    || typeof input.reason !== "string"
    || !input.reason.trim()
  ) return true;
  if (input.action === "ATTACH_PROVIDER_TASK") {
    return Object.keys(input).sort().join(",") !== "action,idempotencyKey,jobId,providerTaskId,reason"
      || typeof input.providerTaskId !== "string"
      || !PROVIDER_TASK_PATTERN.test(input.providerTaskId);
  }
  return input.action !== "RELEASE_UNRESOLVED"
    || Object.keys(input).sort().join(",") !== "action,idempotencyKey,jobId,reason";
}

function failure(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "";
  if (message === "FIRST_PRESENCE_VIDEO_JOB_NOT_FOUND") return json({ error: "VIDEO_RECONCILIATION_JOB_NOT_FOUND" }, { status: 404 });
  if (message === "FIRST_PRESENCE_VIDEO_NOT_UNCERTAIN" || message === "FIRST_PRESENCE_RECONCILIATION_IDEMPOTENCY_CONFLICT") {
    return json({ error: "VIDEO_RECONCILIATION_CONFLICT" }, { status: 409 });
  }
  console.error("[api:internal:video-reconciliation] operation failed");
  return json({ error: "VIDEO_RECONCILIATION_UNAVAILABLE" }, { status: 503 });
}

export function createVideoReconciliationHandler(serviceFactory: () => ReconciliationService) {
  return async function POST(request: NextRequest) {
    const auth = authorized(request);
    if (!auth.ok) return json({ error: "VIDEO_RECONCILIATION_UNAUTHORIZED" }, { status: 401 });
    try {
      if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        return json({ error: "INVALID_VIDEO_RECONCILIATION" }, { status: 400 });
      }
      const body = await request.json().catch(() => null);
      if (typeof body !== "object" || body === null || Array.isArray(body) || invalidBody(body as Record<string, unknown>)) {
        return json({ error: "INVALID_VIDEO_RECONCILIATION" }, { status: 400 });
      }
      const input = body as Record<string, unknown>;
      const job = await serviceFactory().reconcile({
        jobId: input.jobId as string,
        idempotencyKey: input.idempotencyKey as string,
        operatorAccount: auth.operatorAccount,
        action: input.action as "ATTACH_PROVIDER_TASK" | "RELEASE_UNRESOLVED",
        providerTaskId: input.providerTaskId as string | undefined,
        reason: (input.reason as string).trim(),
      });
      return json({ job }, { status: 200 });
    } catch (error) {
      return failure(error);
    }
  };
}
