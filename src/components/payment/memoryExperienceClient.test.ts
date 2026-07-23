import assert from "node:assert/strict";
import test from "node:test";

import {
  createExperienceCheckout,
  describeExperienceStatus,
  loadPaymentSnapshot,
} from "./memoryExperienceClient";

test("payment snapshot reads only the formal order and entitlement endpoints", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const request = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return Response.json(url.toString().includes("orders")
      ? { orders: [{ orderNo: "order-1", status: "pending", paymentUrl: "https://pay.example.test/1" }] }
      : { entitlements: [] });
  };
  const snapshot = await loadPaymentSnapshot("memory-1", request as typeof fetch);
  assert.deepEqual(snapshot.orders, [{ orderNo: "order-1", status: "pending", paymentUrl: "https://pay.example.test/1" }]);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(({ url }) => url), ["/api/payments/orders?memoryId=memory-1", "/api/payments/entitlements?memoryId=memory-1"]);
  assert.ok(requests.every(({ init }) => init?.credentials === "same-origin" && init?.cache === "no-store"));
});

test("checkout sends only memoryId and the idempotency header", async () => {
  let init: RequestInit | undefined;
  const request = async (_url: string | URL | Request, options?: RequestInit) => {
    init = options;
    return Response.json({ order: { paymentUrl: "https://pay.example.test/checkout" } }, { status: 201 });
  };
  assert.equal(await createExperienceCheckout("memory-1", "payment-key-0000001", request as typeof fetch), "https://pay.example.test/checkout");
  assert.equal((init?.headers as Record<string, string>)["Idempotency-Key"], "payment-key-0000001");
  assert.equal(init?.body, JSON.stringify({ memoryId: "memory-1" }));
});

test("experience status makes quota, pending, cancellation, failure, and refund explicit", () => {
  assert.match(describeExperienceStatus({ orders: [], entitlements: [] }).detail, /49元 · 30天 · 1个 TA · 100次 AI 回复。一次性购买，不自动续费/);
  assert.match(describeExperienceStatus({ orders: [], entitlements: [{ status: "active", endsAt: "2030-01-30T00:00:00.000Z", chatQuota: 100, chatUsed: 32 }] }).detail, /68/);
  const pending = describeExperienceStatus({ orders: [{ orderNo: "1", status: "pending", paymentUrl: null }], entitlements: [] });
  assert.match(pending.detail, /取消支付/);
  assert.equal(pending.canPurchase, false);
  assert.match(describeExperienceStatus({ orders: [{ orderNo: "1", status: "cancelled", paymentUrl: null }], entitlements: [] }).title, /取消/);
  assert.match(describeExperienceStatus({ orders: [{ orderNo: "1", status: "failed", paymentUrl: null }], entitlements: [] }).title, /未完成/);
  assert.match(describeExperienceStatus({ orders: [], entitlements: [{ status: "refunded", endsAt: "2030-01-30T00:00:00.000Z", chatQuota: 100, chatUsed: 0 }] }).title, /退款/);
});
