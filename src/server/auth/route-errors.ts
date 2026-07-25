import type { NextResponse } from "next/server";

import { DatabaseDependencyError, safeDatabaseErrorLog } from "@/src/server/database";

import { AuthConfigurationError } from "./crypto";
import { SmsProviderError } from "./sms/sms-verification-provider";
import { WeChatAuthError } from "./wechat/wechat-auth-error";
import { authJson } from "../security/auth-cache";

export function authRouteError(error: unknown): NextResponse {
  if (error instanceof WeChatAuthError) {
    const status = error.code === "WECHAT_AUTH_UNAVAILABLE"
      ? 503
      : error.code === "WECHAT_AUTH_ACCOUNT_CONFLICT"
        ? 409
        : error.code === "WECHAT_AUTH_FAILED"
          ? 502
          : 400;
    return authJson({ error: error.code }, { status });
  }
  if (error instanceof AuthConfigurationError) {
    if (error.code === "ORIGIN_NOT_ALLOWED") {
      return authJson({ error: "ORIGIN_NOT_ALLOWED" }, { status: 403 });
    }
    console.error("[auth] configuration unavailable", { code: error.code });
    return authJson({ error: "AUTH_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof SmsProviderError) {
    const status = error.code === "SMS_RATE_LIMITED" ? 429 : 503;
    return authJson({ error: error.code }, { status });
  }
  if (error instanceof DatabaseDependencyError) {
    console.error("[auth] database unavailable", safeDatabaseErrorLog(error));
    return authJson({ error: "AUTH_UNAVAILABLE" }, { status: 503 });
  }
  console.error("[auth] request failed");
  return authJson({ error: "AUTH_UNAVAILABLE" }, { status: 500 });
}
