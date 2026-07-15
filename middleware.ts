import { NextRequest, NextResponse } from "next/server";

import { checkAllowedOrigin } from "@/src/server/security/origin";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isAuthenticationEndpoint(pathname: string): boolean {
  return pathname.startsWith("/api/auth/")
    || pathname === "/api/send-code"
    || pathname === "/api/verify-code";
}

export function middleware(request: NextRequest) {
  if (!MUTATION_METHODS.has(request.method)) return NextResponse.next();

  const result = checkAllowedOrigin(request);
  if (result.allowed) return NextResponse.next();

  const configurationError = result.code !== "ORIGIN_NOT_ALLOWED";
  const response = NextResponse.json(
    { error: configurationError ? "AUTH_UNAVAILABLE" : result.code },
    { status: configurationError ? 503 : 403 },
  );
  return isAuthenticationEndpoint(request.nextUrl.pathname)
    ? applyAuthNoStore(response)
    : response;
}

export const config = {
  matcher: "/api/:path*",
};
