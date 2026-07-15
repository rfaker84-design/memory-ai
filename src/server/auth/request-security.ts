import { isIP } from "node:net";

import { AuthConfigurationError } from "./crypto";

export function requireTrustedRequestIp(request: Request): string {
  if (process.env.AUTH_TRUST_NGINX_PROXY !== "true") {
    throw new AuthConfigurationError("AUTH_TRUST_NGINX_PROXY_NOT_CONFIGURED");
  }

  const value = request.headers.get("x-real-ip")?.trim() ?? "";
  if (!value || value.includes(",") || isIP(value) === 0) {
    throw new AuthConfigurationError("TRUSTED_CLIENT_IP_MISSING");
  }
  return value;
}

export function requireAllowedOrigin(request: Request): void {
  const allowed = process.env.AUTH_ALLOWED_ORIGIN?.trim();
  if (!allowed) {
    throw new AuthConfigurationError("AUTH_ALLOWED_ORIGIN_NOT_CONFIGURED");
  }

  let normalizedAllowed: string;
  try {
    normalizedAllowed = new URL(allowed).origin;
  } catch {
    throw new AuthConfigurationError("AUTH_ALLOWED_ORIGIN_INVALID");
  }

  const origin = request.headers.get("origin");
  if (!origin || origin !== normalizedAllowed) {
    throw new AuthConfigurationError("ORIGIN_NOT_ALLOWED");
  }
}
