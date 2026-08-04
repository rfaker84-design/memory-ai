import { NextRequest, NextResponse } from "next/server";

import {
  CommerceConfigurationError,
  CommerceNotFoundError,
  CommercePostgresDataSource,
  CommerceRepository,
  CommerceService,
  CommerceStateError,
  CommerceValidationError,
  createCommercePaymentAdapter,
  type CommercePlatform,
  type CommercePaymentAdapter,
} from "@/features/commerce";
import {
  AuthConfigurationError,
  requireAllowedOrigin,
  type AuthSession,
  verifyRequestSession,
} from "@/src/server/auth";
import { hasApprovedMemoryConsent } from "@/features/consent/trust-consent-postgres";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import { blockedHighRiskResponse } from "@/features/understanding-assistance/understanding-assistance";
import { defaultUnderstandingAssistanceGuard, UnderstandingAssistanceError, type UnderstandingAssistanceGuard } from "@/features/understanding-assistance/understanding-assistance-postgres";
import {
  assertProductCapabilityEnabled,
  ProductCapabilityUnavailableError,
  type ProductCapability,
} from "@/src/server/runtime/product-capability-gate";

type OrderService = Pick<CommerceService, "createOrder" | "listOrders">;
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type AdapterFactory = (
  platform: CommercePlatform,
) => CommercePaymentAdapter;
type CapabilityAssertion = (capability: ProductCapability) => void;
type CommercialConsentVerifier = (input: {
  externalUserId: string;
  consentType: "commercial_use";
  memoryId: string;
}) => Promise<boolean>;

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const MEMORY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_COMMERCE_STATE_CODE = /^[A-Z][A-Z0-9_]{2,127}$/;
const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));
const service = (): OrderService =>
  new CommerceService(
    new CommerceRepository(new CommercePostgresDataSource()),
  );

function failure(error: unknown) {
  if (error instanceof UnderstandingAssistanceError) {
    return error.code === "UNDERSTANDING_ASSISTANCE_REQUIRED"
      ? json(blockedHighRiskResponse("purchase"), { status: 409 })
      : json({ error: error.code }, { status: error.code === "ACCOUNT_NOT_FOUND" ? 404 : 409 });
  }
  if (error instanceof ProductCapabilityUnavailableError) {
    return json({ error: error.code }, { status: 503 });
  }
  if (error instanceof CommerceValidationError) {
    return json({ error: "INVALID_COMMERCE_REQUEST" }, { status: 400 });
  }
  if (error instanceof CommerceNotFoundError) {
    return json({ error: "COMMERCE_ACCOUNT_NOT_FOUND" }, { status: 404 });
  }
  if (error instanceof CommerceStateError) {
    const code = PUBLIC_COMMERCE_STATE_CODE.test(error.message)
      ? error.message
      : "COMMERCE_STATE_CONFLICT";
    return json({ error: code }, { status: 409 });
  }
  if (error instanceof CommerceConfigurationError) {
    return json({ error: error.code }, { status: 503 });
  }
  if (error instanceof DatabaseDependencyError) {
    return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof AuthConfigurationError) {
    return json({ error: "AUTH_UNAVAILABLE" }, { status: 503 });
  }
  console.error("[api:commerce:orders] request failed");
  return json({ error: "COMMERCE_REQUEST_FAILED" }, { status: 500 });
}

export function createCommerceOrdersHandler(
  serviceFactory: () => OrderService = service,
  sessionResolver: SessionResolver = verifyRequestSession,
  adapterFactory: AdapterFactory = createCommercePaymentAdapter,
  assertCapability: CapabilityAssertion = assertProductCapabilityEnabled,
  commercialConsentVerifier: CommercialConsentVerifier = hasApprovedMemoryConsent,
  assistanceGuard: UnderstandingAssistanceGuard = defaultUnderstandingAssistanceGuard(),
) {
  return {
    GET: async (request: NextRequest) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        if ([...request.nextUrl.searchParams.keys()].length > 0) {
          return json({ error: "INVALID_COMMERCE_REQUEST" }, { status: 400 });
        }
        return json({
          orders: await serviceFactory().listOrders(session.externalUserId),
        });
      } catch (error) {
        return failure(error);
      }
    },
    POST: async (request: NextRequest) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        assertCapability("commerce_purchase");
        const requestKey = request.headers.get("idempotency-key");
        if (!requestKey || !KEY_PATTERN.test(requestKey)) {
          return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
        }
        const body = await request.json().catch(() => null);
        if (
          typeof body !== "object"
          || body === null
          || Array.isArray(body)
          || Object.keys(body).sort().join(",") !== "memoryId,platform,productId"
        ) {
          return json({ error: "INVALID_COMMERCE_REQUEST" }, { status: 400 });
        }
        const input = body as Record<string, unknown>;
        if (
          typeof input.productId !== "string"
          || typeof input.memoryId !== "string"
          || !MEMORY_ID_PATTERN.test(input.memoryId)
          || !["web", "android", "ios"].includes(String(input.platform))
        ) {
          return json({ error: "INVALID_COMMERCE_REQUEST" }, { status: 400 });
        }
        const platform = input.platform as CommercePlatform;
        await assistanceGuard.assertHighRiskAllowed({ userId: session.userId, externalUserId: session.externalUserId, operation: "purchase" });
        if (!(await commercialConsentVerifier({
          externalUserId: session.externalUserId,
          consentType: "commercial_use",
          memoryId: input.memoryId,
        }))) {
          return json({ error: "COMMERCIAL_CONSENT_REQUIRED" }, { status: 403 });
        }
        const result = await serviceFactory().createOrder({
          externalUserId: session.externalUserId,
          requestKey,
          productId: input.productId,
          platform,
          adapter: adapterFactory(platform),
        });
        return json(result, { status: result.order.status === "pending" ? 201 : 200 });
      } catch (error) {
        return failure(error);
      }
    },
  };
}
