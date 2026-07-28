import { NextRequest, NextResponse } from "next/server";

import { checkAllowedOrigin } from "@/src/server/security/origin";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import { isLegacyChatCommerceTestEnvironment } from "@/features/payment/legacy-chat-commerce-gate";
import {
  hasValidStagingAccessToken,
  isStagingRuntime,
  StagingRuntimeConfigurationError,
} from "@/src/server/runtime/staging-contract";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CORS_ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_ALLOWED_HEADERS = "Content-Type, Authorization, Idempotency-Key, X-MemoryAI-Staging-Access";
const STAGING_ACCESS_HEADER = "x-memoryai-staging-access";

const FORMAL_API_PATHS = new Set([
  "/api/auth/send-code",
  "/api/auth/verify-code",
  "/api/auth/session",
  "/api/auth/logout",
  "/api/auth/wechat/status",
  "/api/auth/wechat/start",
  "/api/auth/wechat/callback",
  "/api/auth/wechat/cancel",
  "/api/auth/wechat/failure",
  "/api/memories",
  "/api/memories/recovery",
  "/api/memory-chat",
  "/api/consents",
  "/api/business-events",
  "/api/business-metrics/funnel",
  "/api/payments/orders",
  "/api/payments/refunds",
  "/api/payments/entitlements",
  "/api/commerce/catalog",
  "/api/commerce/credits",
  "/api/commerce/orders",
  "/api/commerce/refunds",
  "/api/commerce/referrals/code",
  "/api/commerce/referrals/qualifications",
  "/api/commerce/testing/callbacks",
  "/api/internal/commerce-reconciliation",
  "/api/internal/video-reviews",
  "/api/media/upload",
  "/api/media/local",
  "/api/health",
  "/api/health/database",
  "/api/health/ai",
]);

const FORMAL_DYNAMIC_API_PATHS = [
  /^\/api\/memories\/[^/]+$/,
  /^\/api\/memories\/[^/]+\/chat-session$/,
  /^\/api\/memories\/[^/]+\/first-greeting$/,
  /^\/api\/memories\/[^/]+\/long-term-memories$/,
  /^\/api\/memories\/[^/]+\/long-term-memories\/[^/]+$/,
  /^\/api\/media\/[^/]+$/,
];

const LEGACY_CHAT_COMMERCE_API_PATHS = new Set([
  "/api/payments/orders",
  "/api/payments/refunds",
  "/api/payments/entitlements",
]);

export function isFormalApiPath(pathname: string): boolean {
  return FORMAL_API_PATHS.has(pathname)
    || FORMAL_DYNAMIC_API_PATHS.some((pattern) => pattern.test(pathname));
}

function applyCredentialedCors(response: NextResponse, allowedOrigin: string): NextResponse {
  // This function is called only after checkAllowedOrigin succeeds. Echoing the
  // validated request Origin preserves the normalized Origin syntax and never
  // reflects an arbitrary browser Origin.
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS);
  response.headers.set("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS);
  response.headers.set("Vary", "Origin");
  return response;
}

function corsFailure(code: "AUTH_ALLOWED_ORIGIN_NOT_CONFIGURED" | "AUTH_ALLOWED_ORIGIN_INVALID" | "ORIGIN_NOT_ALLOWED") {
  const configurationError = code !== "ORIGIN_NOT_ALLOWED";
  return applyAuthNoStore(NextResponse.json(
    { error: configurationError ? "AUTH_UNAVAILABLE" : code },
    { status: configurationError ? 503 : 403 },
  ));
}

function stagingAccessFailure(status: 403 | 503, allowedOrigin?: string): NextResponse {
  const response = applyAuthNoStore(NextResponse.json(
    { error: status === 403 ? "STAGING_ACCESS_DENIED" : "STAGING_UNAVAILABLE" },
    { status },
  ));
  return allowedOrigin ? applyCredentialedCors(response, allowedOrigin) : response;
}

function requiresStagingAccessToken(request: NextRequest): boolean {
  if (!isStagingRuntime()) return false;
  return !(request.method === "GET" && request.nextUrl.pathname === "/api/media/local");
}

export function middleware(request: NextRequest) {
  if (
    LEGACY_CHAT_COMMERCE_API_PATHS.has(request.nextUrl.pathname)
    && !isLegacyChatCommerceTestEnvironment()
  ) {
    return applyAuthNoStore(NextResponse.json(
      { error: "LEGACY_ROUTE_UNAVAILABLE" },
      { status: 410 },
    ));
  }

  if (!isFormalApiPath(request.nextUrl.pathname)) {
    return applyAuthNoStore(NextResponse.json(
      { error: "LEGACY_ROUTE_UNAVAILABLE" },
      { status: 410 },
    ));
  }

  const browserOrigin = request.headers.get("origin");
  let allowedCorsOrigin: string | undefined;
  if (request.method === "OPTIONS") {
    const result = checkAllowedOrigin(request);
    if (!result.allowed) return corsFailure(result.code);
    return applyCredentialedCors(new NextResponse(null, { status: 204 }), browserOrigin!);
  }

  if (browserOrigin) {
    const result = checkAllowedOrigin(request);
    if (!result.allowed) return corsFailure(result.code);
    allowedCorsOrigin = browserOrigin;
  }

  if (requiresStagingAccessToken(request)) {
    try {
      if (!hasValidStagingAccessToken(request.headers.get(STAGING_ACCESS_HEADER))) {
        return stagingAccessFailure(403, allowedCorsOrigin);
      }
    } catch (error) {
      if (error instanceof StagingRuntimeConfigurationError) {
        return stagingAccessFailure(503, allowedCorsOrigin);
      }
      throw error;
    }
  }

  if (allowedCorsOrigin) return applyCredentialedCors(NextResponse.next(), allowedCorsOrigin);

  if (!MUTATION_METHODS.has(request.method)) return NextResponse.next();

  // This non-production commerce testing callback verifies its own signature.
  if (request.nextUrl.pathname === "/api/commerce/testing/callbacks") return NextResponse.next();

  const result = checkAllowedOrigin(request);
  if (result.allowed) return NextResponse.next();

  return corsFailure(result.code);
}

export const config = {
  matcher: "/api/:path*",
};
