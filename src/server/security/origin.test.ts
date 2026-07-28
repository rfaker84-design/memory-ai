import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const mutationPaths = [
  "/api/auth/send-code",
  "/api/memories",
  "/api/memories/recovery",
  "/api/memories/memory-id",
  "/api/memories/memory-id/chat-session",
  "/api/memories/memory-id/first-greeting",
  "/api/memory-chat",
  "/api/consents",
  "/api/business-events",
  "/api/commerce/orders",
  "/api/commerce/refunds",
  "/api/commerce/referrals/code",
  "/api/commerce/referrals/qualifications",
  "/api/media/upload",
  "/api/media/media-id",
];

const legacyMutationPaths = [
  "/api/payments/orders",
  "/api/payments/refunds",
  "/api/payments/entitlements",
  "/api/payments/wechat/callback",
  "/api/internal/refund-reviews",
  "/api/chat-sessions",
  "/api/chat-sessions/session-id/messages",
  "/api/chat-mvp",
  "/api/memories-mvp",
];

test("every production API mutation is guarded by the shared Origin boundary", async (t) => {
  for (const pathname of mutationPaths) {
    await t.test(pathname, async () => {
      const rejected = middleware(new NextRequest(`https://memoryai.test${pathname}`, {
        method: "POST",
      }));
      assert.equal(rejected.status, 403);
      assert.equal((await rejected.json()).error, "ORIGIN_NOT_ALLOWED");

      const allowed = middleware(new NextRequest(`https://memoryai.test${pathname}`, {
        method: "POST",
        headers: { origin: "https://memoryai.test" },
      }));
      assert.equal(allowed.headers.get("x-middleware-next"), "1");
    });
  }
});

test("the signed test-commerce callback is non-production server-to-server", () => {
  const response = middleware(new NextRequest("https://memoryai.test/api/commerce/testing/callbacks", {
    method: "POST",
  }));
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("legacy mutations are closed before Origin or route execution", async (t) => {
  for (const pathname of legacyMutationPaths) {
    await t.test(pathname, async () => {
      const response = middleware(new NextRequest(`https://memoryai.test${pathname}`, {
        method: "POST",
      }));
      assert.equal(response.status, 410);
      assert.equal((await response.json()).error, "LEGACY_ROUTE_UNAVAILABLE");
      assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    });
  }
});

test("Origin boundary fails closed when production configuration is missing", async () => {
  const configured = process.env.AUTH_ALLOWED_ORIGIN;
  delete process.env.AUTH_ALLOWED_ORIGIN;
  try {
    const response = middleware(new NextRequest("https://memoryai.test/api/memories", {
      method: "DELETE",
      headers: { origin: "https://memoryai.test" },
    }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "AUTH_UNAVAILABLE");
  } finally {
    process.env.AUTH_ALLOWED_ORIGIN = configured;
  }
});

test("safe methods pass through without Origin", () => {
  const response = middleware(new NextRequest("https://memoryai.test/api/health"));
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("the packaged same-site App origin receives credentialed CORS without wildcard reflection", async () => {
  const preflight = middleware(new NextRequest("https://memoryai.test/api/memories", {
    method: "OPTIONS",
    headers: {
      origin: "https://memoryai.test",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,idempotency-key",
    },
  }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://memoryai.test");
  assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
  assert.equal(preflight.headers.get("access-control-allow-headers"), "Content-Type, Authorization, Idempotency-Key");
  assert.equal(preflight.headers.get("vary"), "Origin");

  const actual = middleware(new NextRequest("https://memoryai.test/api/auth/session", {
    headers: { origin: "https://memoryai.test" },
  }));
  assert.equal(actual.headers.get("access-control-allow-origin"), "https://memoryai.test");
  assert.equal(actual.headers.get("access-control-allow-credentials"), "true");

  const rejected = middleware(new NextRequest("https://memoryai.test/api/memories", {
    method: "OPTIONS",
    headers: { origin: "https://attacker.invalid" },
  }));
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
  assert.equal(rejected.headers.get("access-control-allow-credentials"), null);
  assert.equal((await rejected.json()).error, "ORIGIN_NOT_ALLOWED");
});

test("credentialed CORS serializes a configured Origin without a trailing slash", () => {
  const configured = process.env.AUTH_ALLOWED_ORIGIN;
  process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test/";
  try {
    const response = middleware(new NextRequest("https://memoryai.test/api/memories", {
      method: "OPTIONS",
      headers: { origin: "https://memoryai.test" },
    }));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://memoryai.test");
  } finally {
    process.env.AUTH_ALLOWED_ORIGIN = configured;
  }
});
