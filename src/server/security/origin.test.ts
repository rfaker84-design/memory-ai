import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const mutationPaths = [
  "/api/auth/send-code",
  "/api/auth/verify-code",
  "/api/auth/logout",
  "/api/memories",
  "/api/memories/recovery",
  "/api/memories/memory-id",
  "/api/memories/memory-id/chat-session",
  "/api/memories/memory-id/first-greeting",
  "/api/memories/memory-id/companion-motion",
  "/api/memories/memory-id/first-presence-video",
  "/api/memories/memory-id/video-shares",
  "/api/memories/memory-id/video-shares/share-id",
  "/api/memories/memory-id/pickups",
  "/api/memories/memory-id/pickups/pickup-id",
  "/api/memory-chat",
  "/api/consents",
  "/api/reports",
  "/api/account/export",
  "/api/account/understanding-assistance",
  "/api/account/crisis-contacts",
  "/api/account/deletion",
  "/api/account/deletion/guardian-confirmation",
  "/api/business-events",
  "/api/commerce/orders",
  "/api/commerce/refunds",
  "/api/commerce/referrals/code",
  "/api/commerce/referrals/qualifications",
  "/api/internal/video-reconciliation",
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

test("API middleware emits a server-generated opaque request ID for pass-through and rejection", () => {
  const suppliedId = "caller-controlled-request-id";
  const passThrough = middleware(new NextRequest("https://memoryai.test/api/health", {
    headers: { "x-request-id": suppliedId },
  }));
  const rejected = middleware(new NextRequest("https://memoryai.test/api/unknown", {
    headers: { "x-request-id": suppliedId },
  }));

  const passThroughId = passThrough.headers.get("x-request-id");
  const rejectedId = rejected.headers.get("x-request-id");
  assert.match(passThroughId ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(rejectedId ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(passThroughId, suppliedId);
  assert.notEqual(rejectedId, suppliedId);
  assert.equal(rejected.status, 410);
});

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
  for (const pathname of [
    "/api/health",
    "/api/memories/memory-id/first-presence-video/job-id/playback",
    "/api/memories/memory-id/companion-motion",
    "/api/first-presence-video/playback/signed-token",
  ]) {
    const response = middleware(new NextRequest(`https://memoryai.test${pathname}`));
    assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
  }
});

test("a read-only visual-review session is fail-closed for every mutation", async () => {
  const reviewToken = [
    "eyJhbGciOiJub25lIn0",
    "eyJyZWFkT25seVJldmlldyI6dHJ1ZX0",
    "",
  ].join(".");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = middleware(new NextRequest("https://memoryai.test/api/memories", {
      method,
      headers: { cookie: `__Host-memoryai_session=${reviewToken}` },
    }));
    assert.equal(response.status, 403, method);
    assert.deepEqual(await response.json(), { error: "STAGING_VISUAL_REVIEW_READ_ONLY" }, method);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0", method);
  }
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
  assert.equal(preflight.headers.get("access-control-allow-headers"), "Content-Type, Authorization, Idempotency-Key, X-MemoryAI-Staging-Access, X-Video-Review-Access-Token, X-Video-Reviewer-Account");
  assert.equal(preflight.headers.get("access-control-expose-headers"), "X-Request-Id");
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

test("staging requires the Debug APK access token after CORS preflight while permitting its signed local-media read", async () => {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "staging",
    DATABASE_URL: "postgresql://staging:secret@127.0.0.1:5432/memoryai_staging",
    STAGING_DATABASE_ISOLATION: "isolated",
    STAGING_DATABASE_NAME: "memoryai_staging",
    STAGING_DATA_SOURCE: "empty",
    AUTH_ALLOWED_ORIGIN: "https://app.staging.yijianmemory.cn",
    STAGING_ACCESS_TOKEN: "a".repeat(48),
    STAGING_FIXED_SMS_CODE: "246810",
    STAGING_FIXED_SMS_PHONES: "+8613800013800,+8613900013900",
    STAGING_MEDIA_ROOT: "/var/lib/memoryai-staging/media",
    STAGING_MEDIA_SIGNING_SECRET: "m".repeat(32),
    STAGING_OWNER_READONLY_REVIEW_MEMORY_ID: "00000000-0000-4000-8000-000000000001",
    STAGING_VISUAL_REVIEW_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
    STAGING_OWNER_VISUAL_REPAIR_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
    LLM_PROVIDER: "mock",
    TTS_PROVIDER: "mock",
  };
  const previous = new Map(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  try {
    const preflight = middleware(new NextRequest("https://api.staging.yijianmemory.cn/api/auth/session", {
      method: "OPTIONS",
      headers: { origin: "https://app.staging.yijianmemory.cn" },
    }));
    assert.equal(preflight.status, 204);

    const denied = middleware(new NextRequest("https://api.staging.yijianmemory.cn/api/auth/session", {
      headers: { origin: "https://app.staging.yijianmemory.cn" },
    }));
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), "https://app.staging.yijianmemory.cn");

    const allowed = middleware(new NextRequest("https://api.staging.yijianmemory.cn/api/auth/session", {
      headers: {
        origin: "https://app.staging.yijianmemory.cn",
        "x-memoryai-staging-access": "a".repeat(48),
      },
    }));
    assert.equal(allowed.headers.get("x-middleware-next"), "1");

    const signedMedia = middleware(new NextRequest("https://api.staging.yijianmemory.cn/api/media/local?signature=opaque"));
    assert.equal(signedMedia.headers.get("x-middleware-next"), "1");

    const visualReviewRead = middleware(new NextRequest("https://api.staging.yijianmemory.cn/api/memories/memory-id", {
      headers: {
        "x-memoryai-staging-visual-review": "1",
        cookie: "__Host-memoryai_session=eyJhbGciOiJub25lIn0.eyJyZWFkT25seVJldmlldyI6dHJ1ZX0.",
      },
    }));
    assert.equal(visualReviewRead.headers.get("x-middleware-next"), "1");

    const visualReviewIdle = middleware(new NextRequest("https://app.staging.yijianmemory.cn/api/memories/memory-id/companion-motion", {
      headers: {
        "x-memoryai-staging-visual-review": "1",
      },
    }));
    assert.equal(visualReviewIdle.headers.get("x-middleware-next"), "1");

    const visualReviewPlayback = middleware(new NextRequest("https://app.staging.yijianmemory.cn/api/memories/memory-id/first-presence-video/00000000-0000-4000-8000-000000000001/playback", {
      headers: {
        "x-memoryai-staging-visual-review": "1",
      },
    }));
    assert.equal(visualReviewPlayback.headers.get("x-middleware-next"), "1");

    const directReviewWrite = middleware(new NextRequest("https://app.staging.yijianmemory.cn/api/memories/memory-id", {
      method: "POST",
      headers: { "x-memoryai-staging-visual-review": "1" },
    }));
    assert.equal(directReviewWrite.status, 403);
    assert.deepEqual(await directReviewWrite.json(), { error: "STAGING_VISUAL_REVIEW_READ_ONLY" });

    const repairHeaders = {
      origin: "https://app.staging.yijianmemory.cn",
      "x-memoryai-staging-visual-repair": "1",
    };
    const repairChat = middleware(new NextRequest("https://app.staging.yijianmemory.cn/api/memory-chat", {
      method: "POST",
      headers: repairHeaders,
    }));
    assert.equal(repairChat.headers.get("x-middleware-next"), "1");
    const repairSession = middleware(new NextRequest("https://app.staging.yijianmemory.cn/api/memories/00000000-0000-4000-8000-000000000001/chat-session", {
      method: "POST",
      headers: repairHeaders,
    }));
    assert.equal(repairSession.headers.get("x-middleware-next"), "1");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const blocked = middleware(new NextRequest("https://app.staging.yijianmemory.cn/api/memories/00000000-0000-4000-8000-000000000001/pickups", {
        method,
        headers: repairHeaders,
      }));
      assert.equal(blocked.status, 403, method);
      assert.deepEqual(await blocked.json(), { error: "STAGING_VISUAL_REVIEW_READ_ONLY" }, method);
    }
    const forgedOutsideHost = middleware(new NextRequest("https://api.staging.yijianmemory.cn/api/memory-chat", {
      method: "POST",
      headers: repairHeaders,
    }));
    assert.equal(forgedOutsideHost.status, 403);
    assert.deepEqual(await forgedOutsideHost.json(), { error: "STAGING_ACCESS_DENIED" });
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
