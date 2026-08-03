import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createOccasionRewardHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
const session = async () => ({ userId: "00000000-0000-4000-8000-000000000001", externalUserId: "phone:13800138000", expiresAt: new Date(Date.now() + 60_000).toISOString() });

function request(body: unknown, key = "occasion-reward-request-0001", origin = "https://memoryai.test") {
  return new NextRequest("https://memoryai.test/api/commerce/occasion-rewards", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body),
  });
}

test("occasion claim is owner-bound and forwards only the fixed occasion and idempotency key", async () => {
  const calls: unknown[] = [];
  const handler = createOccasionRewardHandler(() => ({
    claimOccasionReward: async (input) => {
      calls.push(input);
      return { occasion: "mothers_day", calendarYear: 2026, eligibleOn: "2026-05-10", claimDeadline: "2026-06-08", claimedAt: "2026-05-10T00:00:00.000Z", saveAllowed: true as const };
    },
    listOpenOccasionRewardOffers: async () => [],
  }), session);
  const response = await handler.POST(request({ occasion: "mothers_day" }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ externalUserId: "phone:13800138000", requestKey: "occasion-reward-request-0001", occasion: "mothers_day" }]);
});

test("occasion claim rejects forged fields, unavailable occasions, and missing origin", async () => {
  const handler = createOccasionRewardHandler(() => ({
    claimOccasionReward: async () => { throw new Error("unexpected"); },
    listOpenOccasionRewardOffers: async () => [],
  }), session);
  assert.equal((await handler.POST(request({ occasion: "mothers_day", memoryId: "forged" }))).status, 400);
  const closed = createOccasionRewardHandler(() => ({
    claimOccasionReward: async () => { const { CommerceStateError } = await import("@/features/commerce"); throw new CommerceStateError("OCCASION_CLAIM_NOT_OPEN"); },
    listOpenOccasionRewardOffers: async () => [],
  }), session);
  assert.deepEqual(await (await closed.POST(request({ occasion: "fathers_day" }))).json(), { error: "OCCASION_CLAIM_NOT_OPEN" });
  assert.equal((await handler.POST(request({ occasion: "mothers_day" }, "occasion-reward-request-0002", "https://other.example"))).status, 403);
});

test("occasion offers are session-scoped, read-only, and reject query parameters", async () => {
  const calls: unknown[] = [];
  const handler = createOccasionRewardHandler(() => ({
    claimOccasionReward: async () => { throw new Error("unexpected"); },
    listOpenOccasionRewardOffers: async (input) => {
      calls.push(input);
      return [{ occasion: "birthday", calendarYear: 2026, eligibleOn: "2026-08-03", claimDeadline: "2026-09-01", claimed: false }];
    },
  }), session);
  const response = await handler.GET(new NextRequest("https://memoryai.test/api/commerce/occasion-rewards"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { offers: [{ occasion: "birthday", calendarYear: 2026, eligibleOn: "2026-08-03", claimDeadline: "2026-09-01", claimed: false }] });
  assert.deepEqual(calls, [{ externalUserId: "phone:13800138000" }]);
  assert.equal((await handler.GET(new NextRequest("https://memoryai.test/api/commerce/occasion-rewards?occasion=birthday"))).status, 400);
});
