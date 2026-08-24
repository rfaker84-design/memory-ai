import { NextRequest, NextResponse } from "next/server";

import { checkAllowedOrigin } from "@/src/server/security/origin";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import { AUTH_SESSION_COOKIE } from "@/src/server/auth/config";
import { isLegacyChatCommerceTestEnvironment } from "@/features/payment/legacy-chat-commerce-gate";
import {
  hasValidStagingAccessToken,
  isStagingRuntime,
  StagingRuntimeConfigurationError,
} from "@/src/server/runtime/staging-contract";
import {
  logApiRequestEvent,
  observabilityRoute,
} from "@/src/server/observability/api-request-events";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CORS_ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_ALLOWED_HEADERS = "Content-Type, Authorization, Idempotency-Key, X-MemoryAI-Staging-Access, X-Video-Review-Access-Token, X-Video-Reviewer-Account";
const STAGING_ACCESS_HEADER = "x-memoryai-staging-access";
const STAGING_VISUAL_REVIEW_HEADER = "x-memoryai-staging-visual-review";
const STAGING_VISUAL_REPAIR_HEADER = "x-memoryai-staging-visual-repair";
const STAGING_APP_HOST = "app.staging.yijianmemory.cn";
const REQUEST_ID_HEADER = "x-request-id";

function hasDirectStagingVisualReviewSource(request: NextRequest): boolean {
  if (
    !isStagingRuntime()
    || (request.headers.get("host") ?? request.nextUrl.host) !== STAGING_APP_HOST
    || request.headers.get(STAGING_VISUAL_REVIEW_HEADER) !== "1"
  ) return false;
  const rawExpiry = process.env.STAGING_VISUAL_REVIEW_EXPIRES_AT?.trim();
  const expiresAt = rawExpiry ? Date.parse(rawExpiry) : Number.NaN;
  const remaining = expiresAt - Date.now();
  return Number.isFinite(expiresAt) && remaining > 0 && remaining <= 30 * 60 * 1000;
}

function hasDirectStagingVisualReviewRead(request: NextRequest): boolean {
  return ["GET", "HEAD"].includes(request.method) && hasDirectStagingVisualReviewSource(request);
}

function hasDirectStagingVisualRepairSource(request: NextRequest): boolean {
  if (
    !isStagingRuntime()
    || (request.headers.get("host") ?? request.nextUrl.host) !== STAGING_APP_HOST
    || request.headers.get(STAGING_VISUAL_REPAIR_HEADER) !== "1"
  ) return false;
  const rawExpiry = process.env.STAGING_OWNER_VISUAL_REPAIR_EXPIRES_AT?.trim();
  const expiresAt = rawExpiry ? Date.parse(rawExpiry) : Number.NaN;
  const remaining = expiresAt - Date.now();
  return Number.isFinite(expiresAt) && remaining > 0 && remaining <= 30 * 60 * 1000;
}

function isStagingVisualRepairMutationPath(pathname: string): boolean {
  if (pathname === "/api/memory-chat") return true;
  const memoryId = pathname.match(/^\/api\/memories\/([^/]+)\/chat-session$/u)?.[1];
  const configuredMemoryId = process.env.STAGING_OWNER_READONLY_REVIEW_MEMORY_ID?.trim();
  return Boolean(memoryId && configuredMemoryId && memoryId === configuredMemoryId);
}

function hasReadOnlyVisualReviewMarker(request: NextRequest): boolean {
  // The actual route handlers verify the JWT signature before granting any
  // owner-scoped read. Here an untrusted marker can only make a request more
  // restrictive (write-denied), so decode failure and forged cookies fail safe.
  const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return false;
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))) as unknown;
    return typeof payload === "object" && payload !== null && (payload as { readOnlyReview?: unknown }).readOnlyReview === true;
  } catch {
    return false;
  }
}

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
  "/api/reports",
  "/api/account/crisis-contacts",
  "/api/account/notification-preferences",
  "/api/account/export",
  "/api/account/profile",
  "/api/account/understanding-assistance",
  "/api/account/deletion",
  "/api/account/deletion/guardian-confirmation",
  "/api/business-events",
  "/api/business-metrics/funnel",
  "/api/product-interactions",
  "/api/payments/orders",
  "/api/payments/refunds",
  "/api/payments/entitlements",
  "/api/commerce/catalog",
  "/api/commerce/credits",
  "/api/commerce/occasion-rewards",
  "/api/commerce/orders",
  "/api/commerce/refunds",
  "/api/commerce/referrals/code",
  "/api/commerce/referrals/qualifications",
  "/api/commerce/testing/callbacks",
  "/api/internal/commerce-reconciliation",
  "/api/internal/operations/alerts",
  "/api/internal/operations/summary",
  "/api/internal/video-reviews",
  "/api/internal/report-reviews",
  "/api/internal/video-reconciliation",
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
  /^\/api\/memories\/[^/]+\/companion-motion$/,
  /^\/api\/memories\/[^/]+\/first-presence-video$/,
  /^\/api\/memories\/[^/]+\/first-presence-video\/[^/]+\/playback$/,
  /^\/api\/memories\/[^/]+\/first-presence-video\/[^/]+\/encounter-playback$/,
  /^\/api\/memories\/[^/]+\/video-shares$/,
  /^\/api\/memories\/[^/]+\/video-shares\/[^/]+$/,
  /^\/api\/memories\/[^/]+\/video-shares\/[^/]+\/download$/,
  /^\/api\/memories\/[^/]+\/long-term-memories$/,
  /^\/api\/memories\/[^/]+\/long-term-memories\/[^/]+$/,
  /^\/api\/memories\/[^/]+\/pickups$/,
  /^\/api\/memories\/[^/]+\/pickups\/[^/]+$/,
  /^\/api\/memories\/[^/]+\/pickup-photo-sources$/,
  /^\/api\/media\/[^/]+$/,
  /^\/api\/first-presence-video\/playback\/[^/]+$/,
  /^\/api\/internal\/video-reviews\/[^/]+\/preview$/,
  /^\/api\/internal\/video-reviews\/[^/]+\/browser-session$/,
  /^\/api\/internal\/video-reviews\/[^/]+\/browser-playback$/,
  /^\/api\/internal\/video-reviews\/preview\/[^/]+$/,
  /^\/api\/video-shares\/[^/]+$/,
  /^\/api\/video-shares\/[^/]+\/playback$/,
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
  response.headers.set("Access-Control-Expose-Headers", "X-Request-Id");
  response.headers.set("Vary", "Origin");
  return response;
}

function createRequestId(): string {
  // Never reflect a caller-supplied identifier. A generated opaque value is safe
  // to expose to the caller and lets support correlate a single API request.
  return crypto.randomUUID();
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

function nextWithRequestId(request: NextRequest, requestId: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }), requestId);
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

function stagingVisualReviewReadOnlyFailure(allowedOrigin?: string): NextResponse {
  const response = applyAuthNoStore(NextResponse.json(
    { error: "STAGING_VISUAL_REVIEW_READ_ONLY" },
    { status: 403 },
  ));
  return allowedOrigin ? applyCredentialedCors(response, allowedOrigin) : response;
}

function requiresStagingAccessToken(request: NextRequest): boolean {
  if (!isStagingRuntime()) return false;
  // This marker is stripped from all non-review sources by Nginx and remains
  // bounded in the server process. Mutations are still narrowed below.
  if (hasDirectStagingVisualRepairSource(request)) return false;
  // A signed, read-only review session may read only through the Nginx-injected
  // marker. The marker has an empty proxy default, so a browser cannot spoof
  // it; mutation methods are rejected above before any route handler runs.
  if (
    ["GET", "HEAD"].includes(request.method)
    && request.headers.get(STAGING_VISUAL_REVIEW_HEADER) === "1"
    && (hasReadOnlyVisualReviewMarker(request) || hasDirectStagingVisualReviewRead(request))
  ) return false;
  // This is a self-authenticating, 60-second reviewer-preview bearer URL. A
  // native video element cannot attach the staging access header to range
  // reads, so the route verifies its signed, exact-job token again in the
  // handler before touching storage. All other API requests retain the gate.
  const reviewerPreview = /^\/api\/internal\/video-reviews\/preview\/[^/]+$/.test(request.nextUrl.pathname);
  const reviewerBrowserPlayback = /^\/api\/internal\/video-reviews\/[^/]+\/browser-playback$/.test(request.nextUrl.pathname);
  return !(["GET", "HEAD"].includes(request.method) && (
    request.nextUrl.pathname === "/api/media/local"
    || reviewerPreview
    // Browser review playback has an exact-job HttpOnly reviewer session and
    // re-checks the pending artifact before it can mint a 60-second media URL.
    || reviewerBrowserPlayback
  ));
}

export function middleware(request: NextRequest) {
  const requestId = createRequestId();
  const route = observabilityRoute(request.nextUrl.pathname);
  const reject = (response: NextResponse, reason: string) => {
    logApiRequestEvent({
      event: "api_request_rejected",
      requestId,
      method: request.method,
      route,
      status: response.status,
      reason,
    });
    return withRequestId(response, requestId);
  };
  const admit = (response: NextResponse, event: "api_request_admitted" | "api_preflight_accepted" = "api_request_admitted") => {
    logApiRequestEvent({ event, requestId, method: request.method, route, status: event === "api_preflight_accepted" ? response.status : undefined });
    return response;
  };

  if (
    LEGACY_CHAT_COMMERCE_API_PATHS.has(request.nextUrl.pathname)
    && !isLegacyChatCommerceTestEnvironment()
  ) {
    return reject(applyAuthNoStore(NextResponse.json(
      { error: "LEGACY_ROUTE_UNAVAILABLE" },
      { status: 410 },
    )), "LEGACY_ROUTE_UNAVAILABLE");
  }

  if (!isFormalApiPath(request.nextUrl.pathname)) {
    return reject(applyAuthNoStore(NextResponse.json(
      { error: "LEGACY_ROUTE_UNAVAILABLE" },
      { status: 410 },
    )), "LEGACY_ROUTE_UNAVAILABLE");
  }

  const browserOrigin = request.headers.get("origin");
  let allowedCorsOrigin: string | undefined;
  if (request.method === "OPTIONS") {
    const result = checkAllowedOrigin(request);
    if (!result.allowed) return reject(corsFailure(result.code), result.code);
    return admit(withRequestId(applyCredentialedCors(new NextResponse(null, { status: 204 }), browserOrigin!), requestId), "api_preflight_accepted");
  }

  if (browserOrigin) {
    const result = checkAllowedOrigin(request);
    if (!result.allowed) return reject(corsFailure(result.code), result.code);
    allowedCorsOrigin = browserOrigin;
  }

  if (MUTATION_METHODS.has(request.method) && (hasReadOnlyVisualReviewMarker(request) || hasDirectStagingVisualReviewSource(request))) {
    return reject(stagingVisualReviewReadOnlyFailure(allowedCorsOrigin), "STAGING_VISUAL_REVIEW_READ_ONLY");
  }

  if (
    MUTATION_METHODS.has(request.method)
    && hasDirectStagingVisualRepairSource(request)
    && !isStagingVisualRepairMutationPath(request.nextUrl.pathname)
  ) {
    return reject(stagingVisualReviewReadOnlyFailure(allowedCorsOrigin), "STAGING_VISUAL_REVIEW_REPAIR_SCOPE_DENIED");
  }

  if (
    hasDirectStagingVisualReviewRead(request)
    && (request.nextUrl.pathname === "/api/account/export" || /\/download$/.test(request.nextUrl.pathname))
  ) {
    return reject(stagingVisualReviewReadOnlyFailure(allowedCorsOrigin), "STAGING_VISUAL_REVIEW_READ_ONLY");
  }

  if (requiresStagingAccessToken(request)) {
    try {
      if (!hasValidStagingAccessToken(request.headers.get(STAGING_ACCESS_HEADER))) {
        return reject(stagingAccessFailure(403, allowedCorsOrigin), "STAGING_ACCESS_DENIED");
      }
    } catch (error) {
      if (error instanceof StagingRuntimeConfigurationError) {
        return reject(stagingAccessFailure(503, allowedCorsOrigin), "STAGING_UNAVAILABLE");
      }
      throw error;
    }
  }

  if (allowedCorsOrigin) return admit(applyCredentialedCors(nextWithRequestId(request, requestId), allowedCorsOrigin));

  if (!MUTATION_METHODS.has(request.method)) return admit(nextWithRequestId(request, requestId));

  // This non-production commerce testing callback verifies its own signature.
  if (request.nextUrl.pathname === "/api/commerce/testing/callbacks") return admit(nextWithRequestId(request, requestId));

  const result = checkAllowedOrigin(request);
  if (result.allowed) return admit(nextWithRequestId(request, requestId));

  return reject(corsFailure(result.code), result.code);
}

export const config = {
  matcher: "/api/:path*",
};
