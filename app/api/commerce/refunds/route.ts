import { NextRequest, NextResponse } from "next/server";

import {
  CommerceNotFoundError,
  CommercePostgresDataSource,
  CommerceRepository,
  CommerceService,
  CommerceStateError,
  CommerceValidationError,
  type CommerceRefundRequest,
} from "@/features/commerce";
import {
  AuthConfigurationError,
  requireAllowedOrigin,
  verifyRequestSession,
} from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const REASONS = new Set<CommerceRefundRequest["reason"]>([
  "unused_purchase",
  "duplicate_charge",
  "service_failure",
]);
const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

export async function POST(request: NextRequest) {
  try {
    const session = await verifyRequestSession(request);
    if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
    requireAllowedOrigin(request);
    const requestKey = request.headers.get("idempotency-key");
    if (!requestKey || !KEY_PATTERN.test(requestKey)) {
      return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
    }
    const body = await request.json().catch(() => null);
    if (
      typeof body !== "object"
      || body === null
      || Array.isArray(body)
      || Object.keys(body).sort().join(",") !== "orderNo,reason"
    ) {
      return json({ error: "INVALID_REFUND_REQUEST" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    if (
      typeof input.orderNo !== "string"
      || typeof input.reason !== "string"
      || !REASONS.has(input.reason as CommerceRefundRequest["reason"])
    ) {
      return json({ error: "INVALID_REFUND_REQUEST" }, { status: 400 });
    }
    const service = new CommerceService(
      new CommerceRepository(new CommercePostgresDataSource()),
    );
    const refund = await service.requestRefund({
      externalUserId: session.externalUserId,
      orderNo: input.orderNo,
      requestKey,
      reason: input.reason as CommerceRefundRequest["reason"],
    });
    return json({ refund }, { status: 202 });
  } catch (error) {
    if (error instanceof CommerceNotFoundError) {
      return json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
    }
    if (error instanceof CommerceStateError) {
      return json({ error: "ORDER_NOT_REFUNDABLE" }, { status: 409 });
    }
    if (error instanceof CommerceValidationError) {
      return json({ error: "INVALID_REFUND_REQUEST" }, { status: 400 });
    }
    if (
      error instanceof AuthConfigurationError
      || error instanceof DatabaseDependencyError
    ) {
      return json({ error: "REFUND_REQUEST_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[api:commerce:refunds] request failed");
    return json({ error: "REFUND_REQUEST_UNAVAILABLE" }, { status: 503 });
  }
}
