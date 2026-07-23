import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createExperienceCheckout,
  createRefundRequest,
  describeRefundRequest,
  describeExperienceStatus,
  loadRefundRequests,
  loadPaymentSnapshot,
} from "./memoryExperienceClient";
import { refundPolicy } from "./refundPolicy";

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

test("refund client uses the formal endpoint, with reason only in the strict body", async () => {
  const refund = { id: "refund-1", memoryId: "memory-1", orderNo: "order-1", status: "processing", eligibility: "eligible", reason: "误购", rejectionReason: null, createdAt: "2026-07-23T00:00:00.000Z", resolvedAt: null };
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const request = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return Response.json(String(url).includes("?") ? { refunds: [refund] } : { refund }, { status: String(url).includes("?") ? 200 : 201 });
  };
  assert.deepEqual(await loadRefundRequests("memory-1", request as typeof fetch), [refund]);
  assert.deepEqual(await createRefundRequest({ memoryId: "memory-1", orderNo: "order-1", reason: "误购", idempotencyKey: "refund-key-00000001" }, request as typeof fetch), refund);
  assert.equal(requests[0].url, "/api/payments/refunds?memoryId=memory-1");
  assert.equal((requests[1].init?.headers as Record<string, string>)["Idempotency-Key"], "refund-key-00000001");
  assert.equal(requests[1].init?.body, JSON.stringify({ memoryId: "memory-1", orderNo: "order-1", reason: "误购" }));
});

test("refund UI copy distinguishes eligibility, processing, success, and rejection reason", () => {
  const base = { id: "refund-1", memoryId: "memory-1", orderNo: "order-1", eligibility: "eligible" as const, reason: "误购", rejectionReason: null, createdAt: "2026-07-23T00:00:00.000Z", resolvedAt: null };
  assert.match(describeRefundRequest({ ...base, status: "processing" }).title, /处理中/);
  assert.match(describeRefundRequest({ ...base, status: "succeeded", resolvedAt: "2026-07-24T00:00:00.000Z" }).title, /已完成/);
  assert.equal(describeRefundRequest({ ...base, status: "rejected", eligibility: "ineligible", rejectionReason: "订单已退款" }).detail, "订单已退款");
  assert.match(describeRefundRequest({ ...base, status: "succeeded", resolvedAt: "2026-07-24T00:00:00.000Z" }).detail, /退款成功后，体验权益立即终止/);
});

test("frozen refund rules have one shared source for purchase and refund surfaces", () => {
  assert.equal(refundPolicy.noReason, "无理由退款仅适用于付款成功后 7 天内、AI 回复零消耗（7天+零消耗）的订单。");
  assert.equal(refundPolicy.afterUse, "使用 AI 回复后，不支持无理由退款。");
  assert.equal(refundPolicy.manualReview, "支付、权益开通、退款结果三类异常将进入人工审核。");
  assert.equal(refundPolicy.entitlementEnd, "退款成功后，体验权益立即终止。");
  const purchaseSurface = readFileSync(new URL("./MemoryExperienceOffer.tsx", import.meta.url), "utf8");
  const refundSurface = readFileSync(new URL("./RefundCenter.tsx", import.meta.url), "utf8");
  for (const field of ["noReason", "afterUse", "manualReview", "entitlementEnd"]) {
    assert.match(purchaseSurface, new RegExp(`refundPolicy\\.${field}`));
    assert.match(refundSurface, new RegExp(`refundPolicy\\.${field}`));
  }
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
