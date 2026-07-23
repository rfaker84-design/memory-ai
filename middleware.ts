import { NextRequest, NextResponse } from "next/server";

import { checkAllowedOrigin } from "@/src/server/security/origin";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const FORMAL_API_PATHS = new Set([
  "/api/auth/send-code",
  "/api/auth/verify-code",
  "/api/auth/session",
  "/api/auth/logout",
  "/api/memories",
  "/api/memory-chat",
  "/api/consents",
  "/api/business-events",
  "/api/business-metrics/funnel",
  "/api/internal/refund-reviews",
  "/api/payments/orders",
  "/api/payments/refunds",
  "/api/payments/entitlements",
  "/api/payments/wechat/callback",
  "/api/media/upload",
  "/api/health",
  "/api/health/database",
  "/api/health/ai",
]);

const FORMAL_DYNAMIC_API_PATHS = [
  /^\/api\/memories\/[^/]+$/,
  /^\/api\/memories\/[^/]+\/chat-session$/,
  /^\/api\/memories\/[^/]+\/first-greeting$/,
  /^\/api\/media\/[^/]+$/,
];

export function isFormalApiPath(pathname: string): boolean {
  return FORMAL_API_PATHS.has(pathname)
    || FORMAL_DYNAMIC_API_PATHS.some((pattern) => pattern.test(pathname));
}

export function middleware(request: NextRequest) {
  if (!isFormalApiPath(request.nextUrl.pathname)) {
    return applyAuthNoStore(NextResponse.json(
      { error: "LEGACY_ROUTE_UNAVAILABLE" },
      { status: 410 },
    ));
  }

  if (!MUTATION_METHODS.has(request.method)) return NextResponse.next();

  // These server-to-server endpoints do not use browser authority. Their Route
  // Handlers enforce their own signed-notification or high-strength token proof.
  if (request.nextUrl.pathname === "/api/payments/wechat/callback" || request.nextUrl.pathname === "/api/internal/refund-reviews") return NextResponse.next();

  const result = checkAllowedOrigin(request);
  if (result.allowed) return NextResponse.next();

  const configurationError = result.code !== "ORIGIN_NOT_ALLOWED";
  const response = NextResponse.json(
    { error: configurationError ? "AUTH_UNAVAILABLE" : result.code },
    { status: configurationError ? 503 : 403 },
  );
  return applyAuthNoStore(response);
}

export const config = {
  matcher: "/api/:path*",
};
