import assert from "node:assert/strict";
import test from "node:test";

import { decodeJwt } from "jose";
import { NextRequest } from "next/server";

import {
  createWeChatCallbackHandler,
  createWeChatCancelHandler,
  createWeChatFailureHandler,
  createWeChatStartHandler,
  createWeChatStatusHandler,
} from "./_handlers";
import {
  AUTH_POLICY,
  WeChatAuthError,
  issueSession,
  verifySessionToken,
} from "@/src/server/auth";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
process.env.SESSION_SECRET = "test-only-session-value-with-at-least-32-bytes";

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  externalUserId: "phone:synthetic",
  createdAt: "2026-07-25T00:00:00.000Z",
};
const WECHAT_USER = {
  id: "00000000-0000-4000-8000-000000000002",
  externalUserId: "wechat:synthetic",
  createdAt: "2026-07-25T00:00:00.000Z",
};

function request(pathname: string): NextRequest {
  return new NextRequest(`https://memoryai.test${pathname}`);
}

function assertNoStore(response: Response): void {
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("vary"), "Cookie, Origin");
}

async function captureConsole<T>(
  action: () => Promise<T>,
): Promise<{ result: T; messages: string[] }> {
  const messages: string[] = [];
  const original = {
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };
  const record = (...values: unknown[]) => {
    messages.push(values.map((value) => (
      typeof value === "string" ? value : JSON.stringify(value)
    )).join(" "));
  };
  console.error = record;
  console.info = record;
  console.log = record;
  console.warn = record;
  try {
    return { result: await action(), messages };
  } finally {
    console.error = original.error;
    console.info = original.info;
    console.log = original.log;
    console.warn = original.warn;
  }
}

test("status discloses only availability and start ignores a residual Session", async () => {
  const status = createWeChatStatusHandler({
    capability: () => ({ provider: "wechat", available: true }),
  });
  const statusResponse = status(request("/api/auth/wechat/status"));
  assert.deepEqual(await statusResponse.json(), {
    provider: "wechat",
    available: true,
  });
  assertNoStore(statusResponse);

  let beginArguments: unknown[] | undefined;
  const start = createWeChatStartHandler({
    createService: () => ({
      begin: async (...args: unknown[]) => {
        beginArguments = args;
        return { authorizationUrl: "https://open.weixin.qq.com/connect/qrconnect?safe=1" };
      },
      complete: async () => USER,
      cancel: async () => {
        throw new WeChatAuthError("WECHAT_AUTH_CANCELLED");
      },
      fail: async () => {
        throw new WeChatAuthError("WECHAT_AUTH_FAILED");
      },
    }),
  });
  const residualToken = await issueSession({
    userId: USER.id,
    externalUserId: USER.externalUserId,
    now: new Date(),
  });
  const response = await start(new NextRequest(
    "https://memoryai.test/api/auth/wechat/start",
    { headers: { cookie: `__Host-memoryai_session=${residualToken}` } },
  ));
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://open.weixin.qq.com/connect/qrconnect?safe=1",
  );
  assert.deepEqual(beginArguments, []);
  assertNoStore(response);

  for (const forgedQuery of [
    "userId=forged",
    "link_user_id=forged",
    "linkUserId=forged",
    "targetAccount=forged",
    "session=forged",
    "mode=bind",
    "bind=true",
    "returnUrl=https%3A%2F%2Fattacker.invalid",
    "redirect_uri=https%3A%2F%2Fattacker.invalid",
  ]) {
    const rejected = await start(request(`/api/auth/wechat/start?${forgedQuery}`));
    assert.equal(rejected.status, 400, forgedQuery);
    assert.deepEqual(
      await rejected.json(),
      { error: "WECHAT_AUTH_FAILED" },
      forgedQuery,
    );
  }
});

test("unconfigured start fails closed with the fixed public code", async () => {
  const start = createWeChatStartHandler({
    createService: () => {
      throw new WeChatAuthError("WECHAT_AUTH_UNAVAILABLE");
    },
  });
  const response = await start(request("/api/auth/wechat/start"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "WECHAT_AUTH_UNAVAILABLE" });
  assertNoStore(response);
});

test("successful callback rotates a residual cookie into the WeChat user's HttpOnly Session", async () => {
  let completeCalls = 0;
  const callback = createWeChatCallbackHandler({
    createSession: issueSession,
    createService: () => ({
      begin: async () => ({ authorizationUrl: "" }),
      complete: async () => {
        completeCalls += 1;
        return WECHAT_USER;
      },
      cancel: async () => {
        throw new WeChatAuthError("WECHAT_AUTH_CANCELLED");
      },
      fail: async () => {
        throw new WeChatAuthError("WECHAT_AUTH_FAILED");
      },
    }),
  });

  const residualToken = await issueSession({
    userId: USER.id,
    externalUserId: USER.externalUserId,
    now: new Date(),
  });
  const state = "s".repeat(43);
  const code = "provider-code-sensitive";
  const captured = await captureConsole(() => callback(new NextRequest(
    `https://memoryai.test/api/auth/wechat/callback?state=${state}&code=${code}`,
    { headers: { cookie: `__Host-memoryai_session=${residualToken}` } },
  )));
  const response = captured.result;
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://memoryai.test/login?wechat=success");
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /__Host-memoryai_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /Path=\//i);
  assert.match(cookie, new RegExp(`Max-Age=${AUTH_POLICY.sessionTtlSeconds}`, "i"));
  assert.doesNotMatch(cookie, /Domain=/i);
  const token = /__Host-memoryai_session=([^;]+)/.exec(cookie)?.[1];
  assert.ok(token);
  assert.notEqual(token, residualToken);
  const jti = decodeJwt(token).jti;
  assert.match(
    jti ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  const verifiedSession = await verifySessionToken(token);
  assert.ok(verifiedSession);
  assert.equal(verifiedSession.userId, WECHAT_USER.id);
  assert.equal(completeCalls, 1);
  assertNoStore(response);

  const publicSurface = JSON.stringify({
    body: await response.clone().text(),
    headers: Object.fromEntries(response.headers),
    location: response.headers.get("location"),
    logs: captured.messages,
  });
  assert.equal(captured.messages.length, 0);
  for (const secret of [state, code, jti ?? ""]) {
    assert.equal(publicSurface.includes(secret), false, secret);
  }

  for (const forgedQuery of [
    "openid=forged",
    "unionid=forged",
    "userId=forged",
    "link_user_id=forged",
    "linkUserId=forged",
    "targetAccount=forged",
    "session=forged",
    "mode=bind",
    "returnUrl=https%3A%2F%2Fattacker.invalid",
    "redirect_uri=https%3A%2F%2Fattacker.invalid",
  ]) {
    const forged = await callback(request(
      `/api/auth/wechat/callback?state=${state}&code=x&${forgedQuery}`,
    ));
    assert.equal(
      forged.headers.get("location"),
      "https://memoryai.test/login?wechat=WECHAT_AUTH_STATE_INVALID",
      forgedQuery,
    );
    assert.equal(forged.headers.has("set-cookie"), false, forgedQuery);
  }
  assert.equal(completeCalls, 1);
});

test("callback, cancel, and failure expose fixed codes and consume through the service", async () => {
  let cancelled = 0;
  let failed = 0;
  const service = {
    begin: async () => ({ authorizationUrl: "" }),
    complete: async () => USER,
    cancel: async () => {
      cancelled += 1;
      throw new WeChatAuthError("WECHAT_AUTH_CANCELLED");
    },
    fail: async () => {
      failed += 1;
      throw new WeChatAuthError("WECHAT_AUTH_FAILED");
    },
  };
  const callback = createWeChatCallbackHandler({
    createService: () => service,
    createSession: issueSession,
  });
  const cancel = createWeChatCancelHandler({ createService: () => service });
  const failure = createWeChatFailureHandler({ createService: () => service });
  const state = "s".repeat(43);

  let response = await callback(request(
    `/api/auth/wechat/callback?state=${state}&error=access_denied`,
  ));
  assert.equal(
    response.headers.get("location"),
    "https://memoryai.test/login?wechat=WECHAT_AUTH_CANCELLED",
  );
  response = await callback(request(
    `/api/auth/wechat/callback?state=${state}&error=provider_error`,
  ));
  assert.equal(
    response.headers.get("location"),
    "https://memoryai.test/login?wechat=WECHAT_AUTH_FAILED",
  );
  response = await cancel(request(`/api/auth/wechat/cancel?state=${state}`));
  assert.equal(
    response.headers.get("location"),
    "https://memoryai.test/login?wechat=WECHAT_AUTH_CANCELLED",
  );
  response = await failure(request(`/api/auth/wechat/failure?state=${state}`));
  assert.equal(
    response.headers.get("location"),
    "https://memoryai.test/login?wechat=WECHAT_AUTH_FAILED",
  );
  assert.equal(cancelled, 2);
  assert.equal(failed, 2);
  assertNoStore(response);
});
