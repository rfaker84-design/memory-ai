import { NextResponse } from "next/server";

import { DatabaseDependencyError, safeDatabaseErrorLog } from "@/src/server/database";

import { AuthConfigurationError } from "./crypto";
import { SmsProviderError } from "./sms/sms-verification-provider";

export function authRouteError(error: unknown): NextResponse {
  if (error instanceof AuthConfigurationError) {
    if (error.code === "ORIGIN_NOT_ALLOWED") {
      return NextResponse.json({ error: "ORIGIN_NOT_ALLOWED" }, { status: 403 });
    }
    console.error("[auth] configuration unavailable", { code: error.code });
    return NextResponse.json({ error: "AUTH_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof SmsProviderError) {
    const status = error.code === "SMS_RATE_LIMITED" ? 429 : 503;
    return NextResponse.json({ error: error.code }, { status });
  }
  if (error instanceof DatabaseDependencyError) {
    console.error("[auth] database unavailable", safeDatabaseErrorLog(error));
    return NextResponse.json({ error: "AUTH_UNAVAILABLE" }, { status: 503 });
  }
  console.error("[auth] request failed");
  return NextResponse.json({ error: "AUTH_UNAVAILABLE" }, { status: 500 });
}
