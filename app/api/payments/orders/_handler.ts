import { NextRequest, NextResponse } from "next/server";

import {
  PaymentConfigurationError,
  PaymentNotFoundError,
  PaymentPostgresDataSource,
  PaymentRepository,
  PaymentService,
  PaymentStateError,
  PaymentValidationError,
  getWeChatPayProvider,
  loadMemoryExperienceProduct,
  type CheckoutProvider,
} from "@/features/payment";
import {
  AuthConfigurationError,
  requireAllowedOrigin,
  requireTrustedRequestIp,
  type AuthSession,
  verifyRequestSession,
} from "@/src/server/auth";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import { DatabaseDependencyError } from "@/src/server/database";

type OrderService = Pick<PaymentService, "createCheckout" | "listOrders">;
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type ProductLoader = typeof loadMemoryExperienceProduct;
type Provider = CheckoutProvider & { assertConfigured?: () => void };

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const service = (): OrderService => new PaymentService(new PaymentRepository(new PaymentPostgresDataSource()));
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

function memoryId(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function failure(error: unknown): NextResponse {
  if (error instanceof PaymentNotFoundError) return json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
  if (error instanceof PaymentValidationError) return json({ error: "INVALID_PAYMENT_REQUEST" }, { status: 400 });
  if (error instanceof PaymentStateError) return json({ error: "ORDER_NOT_PAYABLE" }, { status: 409 });
  if (error instanceof PaymentConfigurationError) return json({ error: error.code }, { status: 503 });
  if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  if (error instanceof AuthConfigurationError) {
    return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  }
  console.error("[api:payments:orders] request failed");
  return json({ error: "PAYMENT_REQUEST_FAILED" }, { status: 500 });
}

export function createPaymentOrdersHandler(
  serviceFactory: () => OrderService = service,
  sessionResolver: SessionResolver = verifyRequestSession,
  providerFactory: () => Provider = getWeChatPayProvider,
  productLoader: ProductLoader = loadMemoryExperienceProduct,
) {
  return {
    GET: async (request: NextRequest) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        const id = memoryId(request.nextUrl.searchParams.get("memoryId"));
        if (!id || [...request.nextUrl.searchParams.keys()].some((key) => key !== "memoryId")) {
          return json({ error: "INVALID_PAYMENT_REQUEST" }, { status: 400 });
        }
        return json({ orders: await serviceFactory().listOrders(session.externalUserId, id) });
      } catch (error) { return failure(error); }
    },
    POST: async (request: NextRequest) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        const requestKey = request.headers.get("idempotency-key");
        if (!requestKey || !KEY_PATTERN.test(requestKey)) return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, { status: 400 }); }
        if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 1 || !("memoryId" in body)) {
          return json({ error: "INVALID_PAYMENT_REQUEST" }, { status: 400 });
        }
        const id = memoryId(body.memoryId);
        if (!id) return json({ error: "INVALID_PAYMENT_REQUEST" }, { status: 400 });
        const provider = providerFactory();
        provider.assertConfigured?.();
        const order = await serviceFactory().createCheckout({
          externalUserId: session.externalUserId, memoryId: id, requestKey,
          product: productLoader(), clientIp: requireTrustedRequestIp(request), provider,
        });
        return json({ order }, { status: order.paymentUrl ? 201 : 409 });
      } catch (error) { return failure(error); }
    },
  };
}
