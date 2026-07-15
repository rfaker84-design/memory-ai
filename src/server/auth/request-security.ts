import { isIP } from "node:net";

import { AuthConfigurationError } from "./crypto";
import { checkAllowedOrigin } from "../security/origin";

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
  const result = checkAllowedOrigin(request);
  if (!result.allowed) throw new AuthConfigurationError(result.code);
}
