import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clearPaymentCheckoutRecovery,
  createExperienceCheckout,
  createRefundRequest,
  describeRefundDecision,
  describeRefundEligibility,
  describeRefundRequest,
  describeExperienceStatus,
  loadRefundRequests,
  loadPaymentSnapshot,
  PAYMENT_CHECKOUT_RECOVERY_STORAGE_KEY,
  readPaymentCheckoutRecovery,
  writePaymentCheckoutRecovery,
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

test("checkout recovery keeps only a valid same-request key in session-shaped storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const recovery = { memoryId: "memory-1", idempotencyKey: "payment-key-0000001" };
  assert.equal(writePaymentCheckoutRecovery(recovery, storage), true);
  assert.deepEqual(readPaymentCheckoutRecovery(storage), recovery);
  values.set(PAYMENT_CHECKOUT_RECOVERY_STORAGE_KEY, JSON.stringify({ memoryId: "memory-1", idempotencyKey: "short", extra: true }));
  assert.equal(readPaymentCheckoutRecovery(storage), null);
  assert.equal(values.has(PAYMENT_CHECKOUT_RECOVERY_STORAGE_KEY), false);
  assert.equal(writePaymentCheckoutRecovery({ memoryId: "memory-1\nunsafe", idempotencyKey: recovery.idempotencyKey }, storage), false);
  assert.equal(clearPaymentCheckoutRecovery(storage), true);
});

test("refund client uses the formal endpoint, with reason only in the strict body", async () => {
  const refund = { id: "refund-1", memoryId: "memory-1", orderNo: "order-1", status: "requested", eligibility: "manual_review", reason: "误购", rejectionReason: null, decisionCode: "REQUESTED_DUPLICATE_CHARGE", createdAt: "2026-07-23T00:00:00.000Z", resolvedAt: null };
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

test("refund parser does not filter requested or manual-review records", async () => {
  const states = ["processing", "requested", "manual_review", "succeeded", "rejected"] as const;
  const eligibility = ["eligible", "eligible", "manual_review", "eligible", "ineligible"] as const;
  const expected = states.map((status, index) => ({
    id: `refund-${status}`, memoryId: "memory-1", orderNo: `order-${status}`, status, eligibility: eligibility[index],
    reason: "退款原因", rejectionReason: status === "rejected" ? "订单不符合条件" : null,
    decisionCode: status === "manual_review" ? "WECHAT_REFUND_CALL_FAILED" : null,
    createdAt: "2026-07-23T00:00:00.000Z", resolvedAt: status === "succeeded" || status === "rejected" ? "2026-07-24T00:00:00.000Z" : null,
  }));
  const request = async () => Response.json({ refunds: expected });
  assert.deepEqual(await loadRefundRequests("memory-1", request as typeof fetch), expected);
});

test("refund UI preserves every supported state, eligibility, and safe decision explanation", () => {
  const base = { id: "refund-1", memoryId: "memory-1", orderNo: "order-1", eligibility: "eligible" as const, reason: "误购", rejectionReason: null, decisionCode: null, createdAt: "2026-07-23T00:00:00.000Z", resolvedAt: null };
  assert.match(describeRefundRequest({ ...base, status: "processing" }).title, /处理中/);
  assert.match(describeRefundRequest({ ...base, status: "requested" }).title, /已提交/);
  assert.match(describeRefundRequest({ ...base, status: "manual_review", eligibility: "manual_review", decisionCode: "DUPLICATE_CHARGE_DETECTED" }).title, /人工审核/);
  assert.match(describeRefundRequest({ ...base, status: "succeeded", resolvedAt: "2026-07-24T00:00:00.000Z" }).title, /已完成/);
  assert.equal(describeRefundRequest({ ...base, status: "rejected", eligibility: "ineligible", rejectionReason: "订单已退款" }).detail, "订单已退款");
  assert.match(describeRefundRequest({ ...base, status: "succeeded", resolvedAt: "2026-07-24T00:00:00.000Z" }).detail, /退款成功后，体验权益立即终止/);
  assert.equal(describeRefundEligibility("eligible"), "符合系统受理条件");
  assert.equal(describeRefundEligibility("manual_review"), "需要人工审核");
  assert.equal(describeRefundEligibility("ineligible"), "不符合系统受理条件");
  const formalDecisionCodes = {
    REQUESTED_DUPLICATE_CHARGE: "已收到重复扣款申请，正在等待人工审核。",
    REQUESTED_ENTITLEMENT_MISSING: "已收到权益未到账申请，正在等待人工审核。",
    REQUESTED_SERVICE_FAILURE: "已收到因忆见平台故障无法正常使用的申请，正在等待人工审核。",
    DUPLICATE_CHARGE_DETECTED: "系统检测到可能重复扣款，已进入人工审核。",
    ENTITLEMENT_MISSING_DETECTED: "系统检测到权益未到账，已进入人工审核。",
    PAYMENT_NOT_SUCCEEDED: "订单未完成付款，不符合退款申请条件。",
    PAID_REPLY_ALREADY_USED: "正常发放且无质量或系统问题的数字权益不支持无理由退款。",
    UNUSED_PURCHASE_WINDOW_EXPIRED: "正常发放且无质量或系统问题的数字权益不支持无理由退款。",
    REVIEW_REJECTED: "人工审核后未通过本次退款申请。",
    WECHAT_REFUND_CALL_FAILED: "退款通道暂时无法确认，已进入人工审核。",
    WECHAT_REFUND_CALLBACK_FAILED: "退款通道未确认结果，已进入人工审核。",
  } as const;
  for (const [decisionCode, description] of Object.entries(formalDecisionCodes)) {
    assert.equal(describeRefundDecision(decisionCode), description, decisionCode);
  }
  assert.equal(describeRefundDecision("untrusted-code"), "系统正在核验退款申请；请以最终处理结果为准。");
  assert.doesNotMatch(describeRefundDecision("untrusted-code")!, /untrusted-code/);
});

test("frozen refund rules have one shared source for purchase and refund surfaces", () => {
  assert.equal(refundPolicy.noReason, "正常发放且无质量或系统问题的数字权益不支持无理由退款。");
  assert.equal(refundPolicy.afterUse, "是否已经使用，不影响重复扣款、权益未到账、系统或 Provider 失败、影像质量判废及平台或法律要求的处理。");
  assert.equal(refundPolicy.manualReview, "上述异常会进入人工核验，并按核验结果退款或补发；不会使用“一经购买概不退款”。");
  assert.equal(refundPolicy.entitlementEnd, "退款成功后，体验权益立即终止。");
  const purchaseSurface = readFileSync(new URL("./MemoryExperienceOffer.tsx", import.meta.url), "utf8");
  const refundSurface = readFileSync(new URL("./RefundCenter.tsx", import.meta.url), "utf8");
  const termsSurface = readFileSync(new URL("../../../app/terms/page.tsx", import.meta.url), "utf8");
  const reportSurface = readFileSync(new URL("../../../app/report/page.tsx", import.meta.url), "utf8");
  for (const field of ["noReason", "afterUse", "manualReview", "entitlementEnd"]) {
    assert.match(purchaseSurface, new RegExp(`refundPolicy\\.${field}`));
    assert.match(refundSurface, new RegExp(`refundPolicy\\.${field}`));
    assert.match(termsSurface, new RegExp(`refundPolicy\\.${field}`));
    assert.match(reportSurface, new RegExp(`refundPolicy\\.${field}`));
  }
  for (const surface of [purchaseSurface, refundSurface, termsSurface, reportSurface]) assert.doesNotMatch(surface, /退款结果异常/);
  assert.match(refundSurface, /"\/api\/commerce\/orders"/);
  assert.match(refundSurface, /"\/api\/commerce\/refunds"/);
  assert.match(refundSurface, /type RefundReason = Exclude<Refund\["reason"\], "unused_purchase">/);
  assert.match(refundSurface, /filter\(\(\[value\]\) => value !== "unused_purchase"\)/);
  assert.doesNotMatch(refundSurface, /\/api\/payments\//);
  assert.match(refundSurface, /不会自动重试/);
  const commerceRefundHandler = readFileSync(new URL("../../../app/api/commerce/refunds/_handler.ts", import.meta.url), "utf8");
  assert.match(commerceRefundHandler, /"duplicate_charge",\s*"entitlement_missing",\s*"service_failure"/);
  assert.doesNotMatch(commerceRefundHandler, /REASONS[\s\S]*?"unused_purchase"/);
  assert.match(reportSurface, /<RefundCenter \/>/);
});

test("Terms delegates its no-reason refund wording to refundPolicy", () => {
  const termsSurface = readFileSync(new URL("../../../app/terms/page.tsx", import.meta.url), "utf8");
  assert.match(termsSurface, /import\s*\{\s*refundPolicy\s*\}.*refundPolicy/);
  assert.match(termsSurface, /refundPolicy\.noReason/);
});

test("the purchase surface uses the frozen emotional handoff title", () => {
  const purchaseSurface = readFileSync(new URL("./MemoryExperienceOffer.tsx", import.meta.url), "utf8");
  const legacyClient = readFileSync(new URL("./memoryExperienceClient.ts", import.meta.url), "utf8");
  assert.match(purchaseSurface, /CONFLICTING_LEGACY/);
  assert.match(legacyClient, /CONFLICTING_LEGACY/);
  assert.match(purchaseSurface, /想继续和TA说说话/);
  assert.match(purchaseSurface, /49元 · 30天 · 1个 TA · 100次 AI 回复/);
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
