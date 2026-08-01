import { NextRequest, NextResponse } from "next/server";

import {
  PaymentNotFoundError,
  PaymentPostgresDataSource,
  PaymentRepository,
  PaymentService,
  PaymentStateError,
  PaymentValidationError,
  getWeChatPayProvider,
  type RefundProvider,
} from "@/features/payment";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import { hasValidInternalAccessToken } from "@/src/server/security/internal-access-token";

type ReviewService = Pick<PaymentService, "reviewManualRefund">;
const TOKEN_HEADER = "x-refund-review-access-token";
const MINIMUM_TOKEN_BYTES = 48;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

function authorized(request: NextRequest): boolean {
  return hasValidInternalAccessToken({
    candidate: request.headers.get(TOKEN_HEADER),
    currentName: "REFUND_REVIEW_ACCESS_TOKEN",
    minimumBytes: MINIMUM_TOKEN_BYTES,
  });
}

function failure(error: unknown): NextResponse {
  if (error instanceof PaymentNotFoundError) return json({ error: "REFUND_NOT_FOUND" }, { status: 404 });
  if (error instanceof PaymentStateError) return json({ error: "REFUND_NOT_REVIEWABLE" }, { status: 409 });
  if (error instanceof PaymentValidationError) return json({ error: "INVALID_REFUND_REVIEW" }, { status: 400 });
  if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  console.error("[api:internal:refund-reviews] operation failed");
  return json({ error: "REFUND_REVIEW_UNAVAILABLE" }, { status: 503 });
}

export function createRefundReviewsHandler(
  serviceFactory: () => ReviewService = () => new PaymentService(new PaymentRepository(new PaymentPostgresDataSource())),
  providerFactory: () => RefundProvider = getWeChatPayProvider,
) {
  return async function POST(request: NextRequest) {
    if (!authorized(request)) return json({ error: "REFUND_REVIEW_UNAUTHORIZED" }, { status: 401 });
    try {
      if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ error: "INVALID_REFUND_REVIEW" }, { status: 400 });
      const body = await request.json().catch(() => null);
      if (typeof body !== "object" || body === null || Array.isArray(body)) return json({ error: "INVALID_REFUND_REVIEW" }, { status: 400 });
      const input = body as Record<string, unknown>;
      if (Object.keys(input).sort().join(",") !== "action,refundId" || typeof input.refundId !== "string" || !UUID_PATTERN.test(input.refundId) || (input.action !== "approve" && input.action !== "reject")) {
        return json({ error: "INVALID_REFUND_REVIEW" }, { status: 400 });
      }
      const refund = await serviceFactory().reviewManualRefund({ refundId: input.refundId, action: input.action, provider: providerFactory() });
      return json({ refund }, { status: refund.status === "requested" ? 202 : 200 });
    } catch (error) { return failure(error); }
  };
}
