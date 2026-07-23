import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { NextRequest } from "next/server";

import { isFormalApiPath, middleware } from "@/middleware";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const EXACT_FORMAL_PATHS = new Set([
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

const P0_PATHS = new Set([
  "/api/payment/callback",
  "/api/payment/create-order",
  "/api/payment/trigger",
  "/api/subscription/status",
  "/api/avatar-callback",
  "/api/voice-clone-callback",
  "/api/avatar-provider",
  "/api/start-avatar-generation",
  "/api/start-voice-training",
  "/api/upload",
  "/api/upload-voice",
  "/api/voice-clone",
  "/api/jobs",
  "/api/jobs/[id]",
  "/api/share/generate",
  "/api/project-state",
]);

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function trackedRoutes(): Array<{ file: string; pathname: string }> {
  return execFileSync("git", ["ls-files", "app/api/**/route.ts"], { encoding: "utf8" })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => ({
      file,
      pathname: `/${file.replace(/\\/g, "/").replace(/^app\//, "").replace(/\/route\.ts$/, "")}`,
    }));
}

function assertNoStore(response: Response): void {
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("vary"), "Cookie, Origin");
}

test("middleware enforces the formal API allowlist before route execution", async () => {
  for (const pathname of EXACT_FORMAL_PATHS) assert.equal(isFormalApiPath(pathname), true, pathname);
  assert.equal(isFormalApiPath("/api/memories/00000000-0000-4000-8000-000000000001"), true);
  assert.equal(isFormalApiPath("/api/memories/00000000-0000-4000-8000-000000000001/first-greeting"), true);
  assert.equal(isFormalApiPath("/api/media/00000000-0000-4000-8000-000000000001"), true);
  for (const pathname of [
    "/api/memories-mvp",
    "/api/memories/",
    "/api/memories//",
    "/api/memories/id/extra",
    "/api/memories/id/chat-session/extra",
    "/api/memories/id/chat-session-suffix",
    "/api/memories/id/first-greeting/extra",
    "/api/memories/id/first-greeting-suffix",
    "/api/media/",
    "/api/media//",
    "/api/media/id/extra",
    "/api/media-upload",
    "/api/health/private",
  ]) {
    assert.equal(isFormalApiPath(pathname), false, pathname);
    const rejected = middleware(new NextRequest(`https://memoryai.test${pathname}`));
    assert.equal(rejected.status, 410, pathname);
    assert.deepEqual(await rejected.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" }, pathname);
    assertNoStore(rejected);
  }

  for (const method of ["GET", "POST"] as const) {
    const response = middleware(new NextRequest("https://memoryai.test/api/unknown", { method }));
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" });
    assertNoStore(response);
  }

  const formalMutation = middleware(new NextRequest("https://memoryai.test/api/memories", {
    method: "POST",
  }));
  assert.equal(formalMutation.status, 403);
  assertNoStore(formalMutation);
});

test("every tracked non-formal Route Handler is a route-level 410", async () => {
  const routes = trackedRoutes();
  assert.equal(routes.length, 92, "the audit must enumerate the complete tracked API surface");

  for (const { file, pathname } of routes) {
    const formal = isFormalApiPath(pathname);
    const source = readFileSync(file, "utf8");
    if (formal) {
      assert.doesNotMatch(source, /legacy(?:Route|Mutation)Unavailable/, pathname);
      continue;
    }

    assert.match(source, /legacy(?:Route|Mutation)Unavailable/, pathname);
    const route = await import(pathToFileURL(path.resolve(file)).href) as Record<string, unknown>;
    for (const method of METHODS) {
      const handler = route[method];
      if (typeof handler !== "function") continue;
      const response = await (handler as (request: NextRequest) => Promise<Response> | Response)(
        new NextRequest(`https://memoryai.test${pathname}`, {
          method,
          headers: { origin: "https://memoryai.test" },
        }),
      );
      assert.equal(response.status, 410, `${method} ${pathname}`);
      assert.deepEqual(await response.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" });
      assertNoStore(response);
    }

    if (P0_PATHS.has(pathname)) {
      assert.doesNotMatch(
        source,
        /supabase|cos-nodejs|payment|tencentcloud|openai|provider|createClient/i,
        `${pathname} imports a forbidden client`,
      );
    }
  }
});

test("formal Session ownership and public health contracts remain explicit", async () => {
  const sources = {
    sendCode: readFileSync("app/api/auth/send-code/route.ts", "utf8"),
    verifyCode: readFileSync("app/api/auth/verify-code/route.ts", "utf8"),
    session: readFileSync("app/api/auth/session/route.ts", "utf8"),
    logout: readFileSync("app/api/auth/logout/route.ts", "utf8"),
    memories: readFileSync("app/api/memories/route.ts", "utf8"),
    memoryItem: readFileSync("app/api/memories/[id]/_handlers.ts", "utf8"),
    chatSession: readFileSync("app/api/memories/[id]/chat-session/_handler.ts", "utf8"),
    firstGreeting: readFileSync("app/api/memories/[id]/first-greeting/_handler.ts", "utf8"),
    memoryChat: readFileSync("app/api/memory-chat/route.ts", "utf8"),
    businessEvents: readFileSync("app/api/business-events/_handler.ts", "utf8"),
    businessFunnel: readFileSync("app/api/business-metrics/funnel/_handler.ts", "utf8"),
    paymentOrders: readFileSync("app/api/payments/orders/route.ts", "utf8"),
    paymentEntitlements: readFileSync("app/api/payments/entitlements/route.ts", "utf8"),
    paymentCallback: readFileSync("app/api/payments/wechat/callback/route.ts", "utf8"),
    media: readFileSync("app/api/media/_lib.ts", "utf8"),
  };
  assert.match(sources.sendCode, /createSendCodeHandler/);
  assert.match(sources.verifyCode, /createVerifyCodeHandler/);
  assert.match(sources.session, /verifyRequestSession/);
  for (const source of [sources.memoryItem, sources.chatSession, sources.firstGreeting]) assert.match(source, /resolveSessionOwner/);
  for (const source of [sources.memoryChat, sources.media]) assert.match(source, /verifyRequestSession/);
  assert.match(sources.logout, /clearSessionCookie/);
  assert.match(sources.memories, /resolveSessionOwner/);
  assert.match(sources.paymentOrders, /createPaymentOrdersHandler/);
  assert.match(sources.paymentEntitlements, /verifyRequestSession/);
  assert.match(sources.paymentCallback, /createWeChatPayCallbackHandler/);
  assert.match(sources.businessEvents, /verifyRequestSession/);
  assert.match(sources.businessFunnel, /BUSINESS_METRICS_ACCESS_TOKEN/);

  const { GET: aiHealth } = await import("./health/ai/route");
  const response = await aiHealth();
  const body = await response.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["status"]);
  assert.doesNotMatch(JSON.stringify(body), /key|provider|registered|secret/i);
});
