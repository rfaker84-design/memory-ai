import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createPaymentRefundsHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const memoryId = "00000000-0000-4000-8000-000000000001";
const orderNo = "YM20260723010101AABBCCDDEEFF";
const session = async () => ({ userId: "session-user", externalUserId: "phone:13800138000", expiresAt: "2026-12-31T00:00:00.000Z" });
const provider = () => ({ createRefund: async () => ({ providerRefundId: "refund-1" }) });
const refund = {
  id: "00000000-0000-4000-8000-000000000002", memoryId, orderNo, amountFen: 29900,
  merchantRefundNo: "YR20260723010101AABBCCDDEEFF", status: "requested" as const,
  eligibility: "eligible" as const, reason: "unused_purchase" as const, decisionCode: null,
  providerRefundId: "refund-1", createdAt: "2026-07-23T00:00:00.000Z",
  requestedAt: "2026-07-23T00:00:01.000Z", resolvedAt: null,
};

test("refund request is session-bound, strict, and delegates only the server-owned provider", async () => {
  let received: Record<string, unknown> | undefined;
  const handler = createPaymentRefundsHandler(() => ({
    createRefundRequest: async (input) => { received = input; return refund; },
    listRefundRequests: async () => [],
  }), session, provider, () => true);
  const response = await handler.POST(new NextRequest("https://memoryai.test/api/payments/refunds", {
    method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": "refund-key-000001" },
    body: JSON.stringify({ memoryId, orderNo, reason: "unused_purchase" }),
  }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { refund });
  const { provider: injectedProvider, ...request } = received!;
  assert.equal(typeof injectedProvider, "object");
  assert.deepEqual(request, { externalUserId: "phone:13800138000", memoryId, orderNo, reason: "unused_purchase", requestKey: "refund-key-000001" });
});

test("all exceptional enum reasons formally enter manual review without invoking WeChat", async () => {
  let providerCalls = 0;
  const received: string[] = [];
  const service = () => ({
    createRefundRequest: async (input: { reason: "unused_purchase" | "duplicate_charge" | "entitlement_missing" | "service_failure" }) => {
      received.push(input.reason);
      return { ...refund, reason: input.reason, status: "manual_review" as const, eligibility: "manual_review" as const, decisionCode: "REQUESTED_SERVICE_FAILURE" };
    }, listRefundRequests: async () => [],
  });
  const handler = createPaymentRefundsHandler(service, session, () => ({ createRefund: async () => { providerCalls += 1; return { providerRefundId: "unused" }; } }), () => true);
  for (const reason of ["duplicate_charge", "entitlement_missing", "service_failure"] as const) {
    const response = await handler.POST(new NextRequest("https://memoryai.test/api/payments/refunds", {
      method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": "refund-key-000001" },
      body: JSON.stringify({ memoryId, orderNo, reason }),
    }));
    assert.equal(response.status, 200);
  }
  assert.deepEqual(received, ["duplicate_charge", "entitlement_missing", "service_failure"]);
  assert.equal(providerCalls, 0);
  const extra = await handler.POST(new NextRequest("https://memoryai.test/api/payments/refunds", {
    method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": "refund-key-000001" },
    body: JSON.stringify({ memoryId, orderNo, reason: "duplicate_charge", userId: "forged" }),
  }));
  assert.equal(extra.status, 400);
  const invalidReason = await handler.POST(new NextRequest("https://memoryai.test/api/payments/refunds", {
    method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": "refund-key-000001" },
    body: JSON.stringify({ memoryId, orderNo, reason: "manual approval please" }),
  }));
  assert.equal(invalidReason.status, 400);
  const anonymous = createPaymentRefundsHandler(service, async () => null, provider, () => true);
  const denied = await anonymous.GET(new NextRequest(`https://memoryai.test/api/payments/refunds?memoryId=${memoryId}`));
  assert.equal(denied.status, 404);
});
