import { NextRequest, NextResponse } from "next/server";

import { CommerceNotFoundError, CommercePostgresDataSource, CommerceRepository, CommerceService, CommerceStateError, CommerceValidationError, type CommerceRefundRequest } from "@/features/commerce";
import { blockedHighRiskResponse } from "@/features/understanding-assistance/understanding-assistance";
import { defaultUnderstandingAssistanceGuard, UnderstandingAssistanceError, type UnderstandingAssistanceGuard } from "@/features/understanding-assistance/understanding-assistance-postgres";
import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const REASONS = new Set<CommerceRefundRequest["reason"]>(["duplicate_charge", "entitlement_missing", "service_failure"]);
type RefundService = Pick<CommerceService, "requestRefund" | "listRefunds">;
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));
const service = (): RefundService => new CommerceService(new CommerceRepository(new CommercePostgresDataSource()));

function failure(error: unknown) {
  if (error instanceof UnderstandingAssistanceError) {
    return error.code === "UNDERSTANDING_ASSISTANCE_REQUIRED"
      ? json(blockedHighRiskResponse("refund"), { status: 409 })
      : json({ error: error.code }, { status: error.code === "ACCOUNT_NOT_FOUND" ? 404 : 409 });
  }
  if (error instanceof CommerceNotFoundError) return json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
  if (error instanceof CommerceStateError) return json({ error: "ORDER_NOT_REFUNDABLE" }, { status: 409 });
  if (error instanceof CommerceValidationError) return json({ error: "INVALID_REFUND_REQUEST" }, { status: 400 });
  if (error instanceof AuthConfigurationError || error instanceof DatabaseDependencyError) return json({ error: "REFUND_REQUEST_UNAVAILABLE" }, { status: 503 });
  console.error("[api:commerce:refunds] request failed"); return json({ error: "REFUND_REQUEST_UNAVAILABLE" }, { status: 503 });
}

export function createCommerceRefundsHandler(
  serviceFactory: () => RefundService = service,
  sessionResolver: SessionResolver = verifyRequestSession,
  assistanceGuard: UnderstandingAssistanceGuard = defaultUnderstandingAssistanceGuard(),
) {
  return {
    GET: async (request: NextRequest) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        if ([...request.nextUrl.searchParams.keys()].length > 0) return json({ error: "INVALID_REFUND_REQUEST" }, { status: 400 });
        return json({ refunds: await serviceFactory().listRefunds(session.externalUserId) });
      } catch (error) { return failure(error); }
    },
    POST: async (request: NextRequest) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        const requestKey = request.headers.get("idempotency-key");
        if (!requestKey || !KEY_PATTERN.test(requestKey)) return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join(",") !== "orderNo,reason") return json({ error: "INVALID_REFUND_REQUEST" }, { status: 400 });
        const input = body as Record<string, unknown>;
        if (typeof input.orderNo !== "string" || typeof input.reason !== "string" || !REASONS.has(input.reason as CommerceRefundRequest["reason"])) return json({ error: "INVALID_REFUND_REQUEST" }, { status: 400 });
        await assistanceGuard.assertHighRiskAllowed({ userId: session.userId, externalUserId: session.externalUserId, operation: "refund" });
        const refund = await serviceFactory().requestRefund({ externalUserId: session.externalUserId, orderNo: input.orderNo, requestKey, reason: input.reason as CommerceRefundRequest["reason"] });
        return json({ refund }, { status: 202 });
      } catch (error) { return failure(error); }
    },
  };
}

