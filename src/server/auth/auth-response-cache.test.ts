import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { POST as legacyLogin } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as legacyRegister } from "@/app/api/auth/register/route";
import { GET as session } from "@/app/api/auth/session/route";
import { createSendCodeHandler } from "@/app/api/auth/send-code/_handler";
import { createVerifyCodeHandler } from "@/app/api/auth/verify-code/_handler";
import { POST as oldSendCode } from "@/app/api/send-code/route";
import { POST as oldVerifyCode } from "@/app/api/verify-code/route";
import { middleware } from "@/middleware";
import { generateVerificationCode } from "./crypto";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
process.env.AUTH_TRUST_NGINX_PROXY = "true";
process.env.AUTH_PROXY_LOOPBACK_ONLY = "true";
process.env.SESSION_SECRET = "test-only-session-value-with-at-least-32-bytes";

function assertNoStore(response: Response): void {
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("vary"), "Cookie, Origin");
}

const request = (pathname: string, body?: string, origin = true) => new NextRequest(
  `https://memoryai.test${pathname}`,
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin: "https://memoryai.test" } : {}),
      "x-real-ip": "127.0.0.1",
    },
    body,
  },
);

test("all auth success and error responses are private no-store", async () => {
  const send = createSendCodeHandler(() => ({
    sendCode: async () => ({
      status: "sent" as const,
      challengeId: "00000000-0000-4000-8000-000000000002",
      resendAfter: "2026-07-15T00:01:00.000Z",
    }),
  }));
  const verify = createVerifyCodeHandler(() => ({
    verifyCode: async () => ({ status: "invalid" as const }),
  }));
  const verifySuccess = createVerifyCodeHandler(() => ({
    verifyCode: async () => ({
      status: "verified" as const,
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        externalUserId: "phone:synthetic-hash",
        createdAt: "2026-07-15T00:00:00.000Z",
      },
    }),
  }));

  const responses = [
    await send(request("/api/auth/send-code", JSON.stringify({ phone: "13800000000" }))),
    await send(request("/api/auth/send-code", "{")),
    await verify(request("/api/auth/verify-code", JSON.stringify({}))),
    await verifySuccess(request("/api/auth/verify-code", JSON.stringify({
      phone: "13800000000",
      code: generateVerificationCode(),
      challengeId: "00000000-0000-4000-8000-000000000002",
    }))),
    await session(new NextRequest("https://memoryai.test/api/auth/session")),
    await logout(request("/api/auth/logout")),
    await legacyLogin(),
    await legacyRegister(),
    await oldSendCode(),
    await oldVerifyCode(),
    middleware(request("/api/auth/send-code", "{}", false)),
  ];

  for (const response of responses) assertNoStore(response);
});
