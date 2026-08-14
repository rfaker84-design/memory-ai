import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createCompanionMotionHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memory.test";

const memoryId = "00000000-0000-4000-8000-000000000001";
const session = async () => ({ userId: "user-1", externalUserId: "phone:test", phone: "+8613800000000", expiresAt: "2099-01-01T00:00:00.000Z" });

test("owner GET reports eligibility without generating and POST creates deterministic slots", async () => {
  let ensureCalls = 0;
  const service = () => ({
    getState: async () => ({ eligible: true, slots: [] }),
    ensure: async () => {
      ensureCalls += 1;
      return ["idle", "attentive", "reflective"].map((variant, index) => ({
        jobId: `00000000-0000-4000-8000-00000000001${index + 1}`,
        variant: variant as "idle" | "attentive" | "reflective",
        status: "queued" as const,
        artifactAvailable: false,
      }));
    },
    ensureIdleVisualReview: async () => [],
  });
  const handler = createCompanionMotionHandler(service, session, () => undefined);
  const context = { params: Promise.resolve({ id: memoryId }) };
  const read = await handler.GET(new NextRequest(`https://memory.test/api/memories/${memoryId}/companion-motion`), context);
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), { eligible: true, slots: [] });
  assert.equal(ensureCalls, 0);
  const write = await handler.POST(new NextRequest(`https://memory.test/api/memories/${memoryId}/companion-motion`, {
    method: "POST",
    headers: { origin: "https://memory.test", "content-type": "application/json" },
    body: "{}",
  }), context);
  assert.equal(write.status, 202);
  assert.equal((await write.json()).slots.length, 3);
  assert.equal(ensureCalls, 1);
});

test("companion motion route is authenticated and rejects request shape", async () => {
  const service = () => ({ getState: async () => ({ eligible: false, slots: [] }), ensure: async () => [], ensureIdleVisualReview: async () => [] });
  const context = { params: Promise.resolve({ id: memoryId }) };
  const anonymous = createCompanionMotionHandler(service, async () => null);
  assert.equal((await anonymous.GET(new NextRequest("https://memory.test/"), context)).status, 401);
  const handler = createCompanionMotionHandler(service, session, () => undefined);
  const bad = await handler.POST(new NextRequest("https://memory.test/", {
    method: "POST", headers: { origin: "https://memory.test", "content-type": "application/json" }, body: '{"retry":true}',
  }), context);
  assert.equal(bad.status, 400);
});

test("the one-off idle visual review stays a session-owned Staging-only request", async () => {
  let reviewCalls = 0;
  const service = () => ({
    getState: async () => ({ eligible: true, slots: [] }),
    ensure: async () => [],
    ensureIdleVisualReview: async () => {
      reviewCalls += 1;
      return [{ jobId: "00000000-0000-4000-8000-000000000011", variant: "idle" as const, status: "queued" as const, artifactAvailable: false }];
    },
  });
  const handler = createCompanionMotionHandler(service, session, () => undefined, () => true);
  const response = await handler.POST(new NextRequest("https://memory.test/", {
    method: "POST",
    headers: { origin: "https://memory.test", "content-type": "application/json" },
    body: '{"review":"idle-visual"}',
  }), { params: Promise.resolve({ id: memoryId }) });
  assert.equal(response.status, 202);
  assert.equal(reviewCalls, 1);
});
