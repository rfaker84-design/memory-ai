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
    ensureAttentiveVisualReview: async () => [],
    ensureAttentiveStillVisualReview: async () => [],
    ensureAttentiveFocusVisualReview: async () => [],
    ensureAcknowledgementVisualReview: async () => [],
    ensureReflectiveVisualReview: async () => [],
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
  const service = () => ({ getState: async () => ({ eligible: false, slots: [] }), ensure: async () => [], ensureIdleVisualReview: async () => [], ensureAttentiveVisualReview: async () => [], ensureAttentiveStillVisualReview: async () => [], ensureAttentiveFocusVisualReview: async () => [], ensureAcknowledgementVisualReview: async () => [], ensureReflectiveVisualReview: async () => [] });
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
    ensureAttentiveVisualReview: async () => [],
    ensureAttentiveStillVisualReview: async () => [],
    ensureAttentiveFocusVisualReview: async () => [],
    ensureAcknowledgementVisualReview: async () => [],
    ensureReflectiveVisualReview: async () => [],
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

test("the next visual review creates only one session-owned attentive sample", async () => {
  let attentiveCalls = 0;
  let packCalls = 0;
  const service = () => ({
    getState: async () => ({ eligible: true, slots: [] }),
    ensure: async () => { packCalls += 1; return []; },
    ensureIdleVisualReview: async () => [],
    ensureAttentiveVisualReview: async () => {
      attentiveCalls += 1;
      return [{ jobId: "00000000-0000-4000-8000-000000000012", variant: "attentive" as const, status: "queued" as const, artifactAvailable: false }];
    },
    ensureAttentiveStillVisualReview: async () => [],
    ensureAttentiveFocusVisualReview: async () => [],
    ensureAcknowledgementVisualReview: async () => [],
    ensureReflectiveVisualReview: async () => [],
  });
  const handler = createCompanionMotionHandler(service, session, () => undefined, () => true);
  const response = await handler.POST(new NextRequest("https://memory.test/", {
    method: "POST",
    headers: { origin: "https://memory.test", "content-type": "application/json" },
    body: '{"review":"attentive-visual"}',
  }), { params: Promise.resolve({ id: memoryId }) });
  assert.equal(response.status, 202);
  assert.equal(attentiveCalls, 1);
  assert.equal(packCalls, 0);
  assert.deepEqual((await response.json()).slots.map((slot: { variant: string }) => slot.variant), ["attentive"]);
});

test("the strict attentive review is bounded to one session-owned passive-listening sample", async () => {
  let stillCalls = 0;
  let packCalls = 0;
  const service = () => ({
    getState: async () => ({ eligible: true, slots: [] }),
    ensure: async () => { packCalls += 1; return []; },
    ensureIdleVisualReview: async () => [],
    ensureAttentiveVisualReview: async () => [],
    ensureAttentiveStillVisualReview: async () => {
      stillCalls += 1;
      return [{ jobId: "00000000-0000-4000-8000-000000000013", variant: "attentive" as const, status: "queued" as const, artifactAvailable: false }];
    },
    ensureAttentiveFocusVisualReview: async () => [],
    ensureAcknowledgementVisualReview: async () => [],
    ensureReflectiveVisualReview: async () => [],
  });
  const handler = createCompanionMotionHandler(service, session, () => undefined, () => true);
  const response = await handler.POST(new NextRequest("https://memory.test/", {
    method: "POST",
    headers: { origin: "https://memory.test", "content-type": "application/json" },
    body: '{"review":"attentive-still-visual"}',
  }), { params: Promise.resolve({ id: memoryId }) });
  assert.equal(response.status, 202);
  assert.equal(stillCalls, 1);
  assert.equal(packCalls, 0);
  assert.deepEqual((await response.json()).slots.map((slot: { variant: string }) => slot.variant), ["attentive"]);
});

test("the focused attentive review creates only one session-owned attentive sample", async () => {
  let focusCalls = 0;
  let packCalls = 0;
  const service = () => ({
    getState: async () => ({ eligible: true, slots: [] }),
    ensure: async () => { packCalls += 1; return []; },
    ensureIdleVisualReview: async () => [],
    ensureAttentiveVisualReview: async () => [],
    ensureAttentiveStillVisualReview: async () => [],
    ensureAttentiveFocusVisualReview: async () => {
      focusCalls += 1;
      return [{ jobId: "00000000-0000-4000-8000-000000000016", variant: "attentive" as const, status: "queued" as const, artifactAvailable: false }];
    },
    ensureAcknowledgementVisualReview: async () => [],
    ensureReflectiveVisualReview: async () => [],
  });
  const handler = createCompanionMotionHandler(service, session, () => undefined, () => true);
  const response = await handler.POST(new NextRequest("https://memory.test/", {
    method: "POST",
    headers: { origin: "https://memory.test", "content-type": "application/json" },
    body: '{"review":"attentive-focus-visual"}',
  }), { params: Promise.resolve({ id: memoryId }) });
  assert.equal(response.status, 202);
  assert.equal(focusCalls, 1);
  assert.equal(packCalls, 0);
  assert.deepEqual((await response.json()).slots.map((slot: { variant: string }) => slot.variant), ["attentive"]);
});

test("the one-shot acknowledgement review creates only its session-owned acknowledgement slot", async () => {
  let acknowledgementCalls = 0;
  let packCalls = 0;
  const service = () => ({
    getState: async () => ({ eligible: true, slots: [] }),
    ensure: async () => { packCalls += 1; return []; },
    ensureIdleVisualReview: async () => [],
    ensureAttentiveVisualReview: async () => [],
    ensureAttentiveStillVisualReview: async () => [],
    ensureAttentiveFocusVisualReview: async () => [],
    ensureAcknowledgementVisualReview: async () => {
      acknowledgementCalls += 1;
      return [{ jobId: "00000000-0000-4000-8000-000000000014", variant: "acknowledgement" as const, status: "queued" as const, artifactAvailable: false }];
    },
    ensureReflectiveVisualReview: async () => [],
  });
  const handler = createCompanionMotionHandler(service, session, () => undefined, () => true);
  const response = await handler.POST(new NextRequest("https://memory.test/", {
    method: "POST",
    headers: { origin: "https://memory.test", "content-type": "application/json" },
    body: '{"review":"acknowledgement-visual"}',
  }), { params: Promise.resolve({ id: memoryId }) });
  assert.equal(response.status, 202);
  assert.equal(acknowledgementCalls, 1);
  assert.equal(packCalls, 0);
  assert.deepEqual((await response.json()).slots.map((slot: { variant: string }) => slot.variant), ["acknowledgement"]);
});

test("the quiet reflective review creates only its session-owned reflective sample", async () => {
  let reflectiveCalls = 0;
  let packCalls = 0;
  const service = () => ({
    getState: async () => ({ eligible: true, slots: [] }),
    ensure: async () => { packCalls += 1; return []; },
    ensureIdleVisualReview: async () => [],
    ensureAttentiveVisualReview: async () => [],
    ensureAttentiveStillVisualReview: async () => [],
    ensureAttentiveFocusVisualReview: async () => [],
    ensureAcknowledgementVisualReview: async () => [],
    ensureReflectiveVisualReview: async () => {
      reflectiveCalls += 1;
      return [{ jobId: "00000000-0000-4000-8000-000000000015", variant: "reflective" as const, status: "queued" as const, artifactAvailable: false }];
    },
  });
  const handler = createCompanionMotionHandler(service, session, () => undefined, () => true);
  const response = await handler.POST(new NextRequest("https://memory.test/", {
    method: "POST",
    headers: { origin: "https://memory.test", "content-type": "application/json" },
    body: '{"review":"reflective-visual"}',
  }), { params: Promise.resolve({ id: memoryId }) });
  assert.equal(response.status, 202);
  assert.equal(reflectiveCalls, 1);
  assert.equal(packCalls, 0);
  assert.deepEqual((await response.json()).slots.map((slot: { variant: string }) => slot.variant), ["reflective"]);
});
