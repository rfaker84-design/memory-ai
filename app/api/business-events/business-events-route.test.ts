import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createBusinessEventsHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

function request(body: unknown) {
  return new NextRequest("https://memoryai.test/api/business-events", {
    method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

test("business view events are session-owned, minimal, and idempotency-ready", async () => {
  let input: unknown;
  const handler = createBusinessEventsHandler(
    () => ({ recordViewedEvent: async (value) => { input = value; return true; } }),
    async () => ({ userId: "user-1", externalUserId: "phone:hash", expiresAt: "2026-07-24T00:00:00.000Z" }),
  );
  const response = await handler(request({ event: "first_greeting_viewed", memoryId: "00000000-0000-4000-8000-000000000001" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { recorded: true });
  assert.deepEqual(input, { externalUserId: "phone:hash", event: "first_greeting_viewed", memoryId: "00000000-0000-4000-8000-000000000001" });
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("business view events reject private payload fields and missing sessions", async () => {
  const denied = createBusinessEventsHandler(
    () => ({ recordViewedEvent: async () => true }),
    async () => null,
  );
  assert.equal((await denied(request({ event: "payment_entry_viewed", memoryId: "00000000-0000-4000-8000-000000000001" }))).status, 401);
  const handler = createBusinessEventsHandler(
    () => ({ recordViewedEvent: async () => true }),
    async () => ({ userId: "user-1", externalUserId: "phone:hash", expiresAt: "2026-07-24T00:00:00.000Z" }),
  );
  assert.equal((await handler(request({ event: "payment_entry_viewed", memoryId: "00000000-0000-4000-8000-000000000001", content: "private" }))).status, 400);
});
