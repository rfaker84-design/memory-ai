import { NextRequest, NextResponse } from "next/server";

import {
  PaymentNotFoundError,
  PaymentPostgresDataSource,
  PaymentRepository,
  PaymentService,
  PaymentValidationError,
  getWeChatPayProvider,
  type CreateRefundRequestInput,
  type RefundRequest,
  type RefundProvider,
} from "@/features/payment";
import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

type RefundService = Pick<PaymentService, "createRefundRequest" | "listRefundRequests">;
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
const service = (): RefundService => new PaymentService(new PaymentRepository(new PaymentPostgresDataSource()));
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function failure(error: unknown) {
  if (error instanceof PaymentNotFoundError) return json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
  if (error instanceof PaymentValidationError) return json({ error: "INVALID_REFUND_REQUEST" }, { status: 400 });
  if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  console.error("[api:payments:refunds] request failed");
  return json({ error: "REFUND_REQUEST_FAILED" }, { status: 500 });
}

export function createPaymentRefundsHandler(
  serviceFactory: () => RefundService = service,
  sessionResolver: SessionResolver = verifyRequestSession,
  providerFactory: () => RefundProvider = getWeChatPayProvider,
) {
  return {
    GET: async (request: NextRequest) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        const memoryId = text(request.nextUrl.searchParams.get("memoryId"), 64);
        if (!memoryId || [...request.nextUrl.searchParams.keys()].join(",") !== "memoryId") return json({ error: "INVALID_REFUND_REQUEST" }, { status: 400 });
        return json({ refunds: await serviceFactory().listRefundRequests(session.externalUserId, memoryId) });
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
        if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).sort().join(",") !== "memoryId,orderNo,reason") {
          return json({ error: "INVALID_REFUND_REQUEST" }, { status: 400 });
        }
        const input = body as Record<string, unknown>;
        const memoryId = text(input.memoryId, 64);
        const orderNo = text(input.orderNo, 64);
        const reason = text(input.reason, 500);
        if (!memoryId || !orderNo || !reason) return json({ error: "INVALID_REFUND_REQUEST" }, { status: 400 });
        const refund = await serviceFactory().createRefundRequest({
          externalUserId: session.externalUserId, memoryId, orderNo, reason, requestKey, provider: providerFactory(),
        } satisfies CreateRefundRequestInput & { provider: RefundProvider });
        return json({ refund }, { status: refund.status === "requested" ? 201 : 200 });
      } catch (error) { return failure(error); }
    },
  };
}

export type { RefundRequest };
