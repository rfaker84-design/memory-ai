import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createRefundReviewsHandler } from "./_handler";

const token = "r".repeat(48);
const refundId = "00000000-0000-4000-8000-000000000021";
const refund = {
  id: refundId, memoryId: "00000000-0000-4000-8000-000000000011", orderNo: "YM20260723010101ABCDEF012345",
  amountFen: 29900, merchantRefundNo: "YR20260723010101ABCDEF012345", status: "requested" as const,
  eligibility: "eligible" as const, reason: "service_failure" as const, decisionCode: null,
  providerRefundId: "refund-1", createdAt: "2026-07-23T01:02:01.000Z", requestedAt: "2026-07-23T01:02:02.000Z", resolvedAt: null,
};

test("internal refund review fails closed without the independent high-strength token", async () => {
  const previous = process.env.REFUND_REVIEW_ACCESS_TOKEN;
  delete process.env.REFUND_REVIEW_ACCESS_TOKEN;
  let called = false;
  try {
    const handler = createRefundReviewsHandler(() => ({ reviewManualRefund: async () => { called = true; return refund; } }));
    const missing = await handler(new NextRequest("https://memoryai.test/api/internal/refund-reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refundId, action: "approve" }) }));
    assert.equal(missing.status, 401);
    process.env.REFUND_REVIEW_ACCESS_TOKEN = "short";
    const weak = await handler(new NextRequest("https://memoryai.test/api/internal/refund-reviews", { method: "POST", headers: { "content-type": "application/json", "x-refund-review-access-token": "short" }, body: JSON.stringify({ refundId, action: "approve" }) }));
    assert.equal(weak.status, 401);
    process.env.REFUND_REVIEW_ACCESS_TOKEN = token;
    const wrong = await handler(new NextRequest("https://memoryai.test/api/internal/refund-reviews", { method: "POST", headers: { "content-type": "application/json", "x-refund-review-access-token": "x".repeat(48) }, body: JSON.stringify({ refundId, action: "approve" }) }));
    assert.equal(wrong.status, 401);
    assert.equal(called, false);
  } finally {
    if (previous === undefined) delete process.env.REFUND_REVIEW_ACCESS_TOKEN;
    else process.env.REFUND_REVIEW_ACCESS_TOKEN = previous;
  }
});

test("internal review accepts only strict approve or reject input and never uses a Session", async () => {
  const previous = process.env.REFUND_REVIEW_ACCESS_TOKEN;
  process.env.REFUND_REVIEW_ACCESS_TOKEN = token;
  const calls: unknown[] = [];
  try {
    const handler = createRefundReviewsHandler(
      () => ({
        reviewManualRefund: async (input) => {
          calls.push(input);
          return input.action === "approve"
            ? refund
            : { ...refund, status: "rejected" as const, eligibility: "ineligible" as const, decisionCode: "REVIEW_REJECTED", resolvedAt: "2026-07-23T01:03:01.000Z" };
        },
      }),
      () => ({ createRefund: async () => { throw new Error("unused"); } }),
    );
    for (const action of ["approve", "reject"] as const) {
      const response = await handler(new NextRequest("https://memoryai.test/api/internal/refund-reviews", { method: "POST", headers: { "content-type": "application/json", "x-refund-review-access-token": token }, body: JSON.stringify({ refundId, action }) }));
      assert.equal(response.status, action === "approve" ? 202 : 200);
    }
    assert.equal(calls.length, 2);
    assert.deepEqual((calls[0] as { refundId: string; action: string }).refundId, refundId);
    const invalid = await handler(new NextRequest("https://memoryai.test/api/internal/refund-reviews", { method: "POST", headers: { "content-type": "application/json", "x-refund-review-access-token": token }, body: JSON.stringify({ refundId, action: "approve", userId: "forged" }) }));
    assert.equal(invalid.status, 400);
  } finally {
    if (previous === undefined) delete process.env.REFUND_REVIEW_ACCESS_TOKEN;
    else process.env.REFUND_REVIEW_ACCESS_TOKEN = previous;
  }
});
