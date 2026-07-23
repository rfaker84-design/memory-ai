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
  "/api/business-events",
  "/api/business-metrics/funnel",
  "/api/payments/orders",
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

  // This endpoint is authenticated by WeChat Pay's signed notification, not a
  // browser Origin. Its Route Handler verifies both signature and encrypted payload.
  if (request.nextUrl.pathname === "/api/payments/wechat/callback") return NextResponse.next();

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
