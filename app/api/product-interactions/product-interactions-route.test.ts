import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest, NextResponse } from "next/server";

import { createProductInteractionHandler } from "./_handler";
import { resetProductInteractionRateLimitForTest, consumeProductInteractionRateLimit } from "@/features/product-metrics/product-interaction-security";
import { AuthConfigurationError } from "@/src/server/auth";

const origin = "https://memoryai.test";
const memoryId = "00000000-0000-4000-8000-000000000001";
const anonymousId = "00000000-0000-4000-8000-000000000002";

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://memoryai.test/api/product-interactions", {
    method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}

const guest = { schemaVersion: 1, eventName: "guest_experience_started", idempotencyKey: "metrics:v1:guest-start:0001", properties: { surface: "guest_home" } } as const;

test("route binds an authenticated event to the server session and rejects forged identity fields", async () => {
  let input: Record<string, unknown> | undefined;
  const handler = createProductInteractionHandler(
    () => ({ recordInteraction: async (candidate) => { input = candidate; return { recorded: true }; } }),
    async () => ({ userId: "server-user", externalUserId: "owner-1", expiresAt: "2030-01-01T00:00:00.000Z" }),
    () => undefined,
  );
  const response = await handler(request({
    schemaVersion: 1, eventName: "photo_upload_succeeded", idempotencyKey: "metrics:v1:photo-upload:0001",
    memoryId, properties: { surface: "first_presence" },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(input, {
    schemaVersion: 1, eventName: "photo_upload_succeeded", idempotencyKey: "metrics:v1:photo-upload:0001",
    memoryId, properties: { surface: "first_presence" }, source: "web", externalUserId: "owner-1",
  });

  for (const field of ["ownerId", "environment", "synthetic", "internal", "occurredAt", "anonymousSessionId"]) {
    const forged = await handler(request({ ...guest, [field]: "forged" }));
    assert.equal(forged.status, 400, field);
  }
});

test("anonymous identity is server-issued and the client cannot choose it", async () => {
  let input: Record<string, unknown> | undefined;
  let cookieWritten = false;
  const handler = createProductInteractionHandler(
    () => ({ recordInteraction: async (candidate) => { input = candidate; return { recorded: true }; } }),
    async () => null,
    () => undefined,
    async () => ({ id: anonymousId, newlyIssued: true }),
    async (response) => { cookieWritten = true; response.cookies.set("test_metrics_anon", "server-issued"); },
  );
  const response = await handler(request(guest));
  assert.equal(response.status, 200);
  assert.equal(cookieWritten, true);
  assert.equal((input as { anonymousSessionId?: string }).anonymousSessionId, anonymousId);
  assert.match(response.headers.get("set-cookie") ?? "", /test_metrics_anon=server-issued/);
});

test("strict v1 envelope rejects unsupported schemas, arbitrary properties and sensitive-shaped content", async () => {
  const handler = createProductInteractionHandler(
    () => ({ recordInteraction: async () => ({ recorded: true }) }),
    async () => null,
    () => undefined,
    async () => ({ id: anonymousId, newlyIssued: false }),
  );
  for (const body of [
    { ...guest, schemaVersion: 2 },
    { ...guest, properties: { surface: "guest_home", content: "never-store" } },
    { ...guest, phone: "13800138000" },
    { schemaVersion: 1, eventName: "first_presence_video_played_3s", idempotencyKey: "metrics:v1:video-play:0001", properties: { elapsed_ms: 1000 } },
  ]) {
    const response = await handler(request(body));
    assert.equal(response.status, 400);
  }
});

test("request size, Origin and subject rate limits fail closed", async () => {
  const handler = createProductInteractionHandler(
    () => ({ recordInteraction: async () => ({ recorded: true }) }),
    async () => null,
    () => undefined,
    async () => ({ id: anonymousId, newlyIssued: false }),
    async () => undefined,
    () => ({ allowed: false, retryAfterSeconds: 30 }),
  );
  const rateLimited = await handler(request(guest));
  assert.equal(rateLimited.status, 429);
  assert.equal(rateLimited.headers.get("retry-after"), "30");

  const oversized = await handler(request({ ...guest, padding: "x".repeat(9 * 1024) }));
  assert.equal(oversized.status, 413);

  const crossOrigin = createProductInteractionHandler(
    () => ({ recordInteraction: async () => ({ recorded: true }) }),
    async () => null,
    () => { throw new AuthConfigurationError("ORIGIN_NOT_ALLOWED"); },
  );
  assert.equal((await crossOrigin(request(guest))).status, 403);
});

test("rate limits are isolated by server-resolved subject", () => {
  resetProductInteractionRateLimitForTest();
  for (let index = 0; index < 12; index += 1) assert.equal(consumeProductInteractionRateLimit("owner:a", 1_000).allowed, true);
  assert.equal(consumeProductInteractionRateLimit("owner:a", 1_000).allowed, false);
  assert.equal(consumeProductInteractionRateLimit("owner:b", 1_000).allowed, true);
});
