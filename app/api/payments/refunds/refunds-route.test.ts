import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createPaymentRefundsHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

const memoryId = "00000000-0000-4000-8000-000000000001";
const orderNo = "YM20260723010101AABBCCDDEEFF";
const session = async () => ({ userId: "session-user", externalUserId: "phone:13800138000", expiresAt: "2026-12-31T00:00:00.000Z" });
const refund = { id: "00000000-0000-4000-8000-000000000002", memoryId, orderNo, status: "processing" as const, eligibility: "eligible" as const, reason: "误购", rejectionReason: null, createdAt: "2026-07-23T00:00:00.000Z", resolvedAt: null };

test("refund request is session-bound, strict, and idempotency-key protected", async () => {
  let received: unknown;
  const handler = createPaymentRefundsHandler(() => ({
    createRefundRequest: async (input) => { received = input; return refund; },
    listRefundRequests: async () => [],
  }), session);
  const response = await handler.POST(new NextRequest("https://memoryai.test/api/payments/refunds", {
    method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": "refund-key-000001" },
    body: JSON.stringify({ memoryId, orderNo, reason: "误购" }),
  }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { refund });
  assert.deepEqual(received, { externalUserId: "phone:13800138000", memoryId, orderNo, reason: "误购", requestKey: "refund-key-000001" });
});

test("refund route rejects extra body fields and anonymous requests", async () => {
  const service = () => ({ createRefundRequest: async () => refund, listRefundRequests: async () => [] });
  const handler = createPaymentRefundsHandler(service, session);
  const extra = await handler.POST(new NextRequest("https://memoryai.test/api/payments/refunds", {
    method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": "refund-key-000001" },
    body: JSON.stringify({ memoryId, orderNo, reason: "误购", userId: "forged" }),
  }));
  assert.equal(extra.status, 400);
  const anonymous = createPaymentRefundsHandler(service, async () => null);
  const denied = await anonymous.GET(new NextRequest(`https://memoryai.test/api/payments/refunds?memoryId=${memoryId}`));
  assert.equal(denied.status, 401);
});
