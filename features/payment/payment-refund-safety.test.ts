import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createPaymentRefundsHandler } from "../../app/api/payments/refunds/_handler";
import { PaymentRepository } from "./payment-repository";
import { PaymentService } from "./payment-service";
import type { PaymentDataSource } from "./payment-datasource";
import type { RefundRequest } from "./types";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
const memoryId = "00000000-0000-4000-8000-000000000011";
const orderNo = "YM20260723010101ABCDEF012345";
const owner = "phone:refund-owner";
const makeRefund = (status: RefundRequest["status"], eligibility: RefundRequest["eligibility"], decisionCode: string | null = null): RefundRequest => ({ id: "00000000-0000-4000-8000-000000000012", memoryId, orderNo, amountFen: 29900, merchantRefundNo: "YR20260723010101ABCDEF012345", status, eligibility, decisionCode, reason: "unused_purchase", providerRefundId: null, createdAt: "2026-07-23T00:00:00.000Z", requestedAt: null, resolvedAt: null });
function source(initial: RefundRequest, events: string[]): PaymentDataSource { return {
  createOrder: async () => { throw Error("unused"); }, attachCheckout: async () => { throw Error("unused"); }, markCheckoutFailure: async () => undefined,
  listOrders: async () => [], listEntitlements: async () => [], applyCallback: async () => { throw Error("unused"); }, listRefundRequests: async () => [], createRefundRequest: async () => initial,
  markRefundRequested: async (no, value) => { events.push(`wechat:${no}`); return { ...initial, status: "requested", providerRefundId: value.providerRefundId }; },
  markRefundManualReview: async (_no, code) => { events.push(`manual:${code}`); return { ...initial, status: "manual_review", eligibility: "manual_review", decisionCode: code }; }, reserveChatQuota: async () => "free", releaseChatQuota: async () => undefined,
  beginManualRefundApproval: async () => ({ refund: initial, shouldCallProvider: false }), rejectManualRefund: async () => initial,
}; }
async function run(initial: RefundRequest, events: string[], provider = async () => ({ providerRefundId: "wx-refund" })) { return new PaymentService(new PaymentRepository(source(initial, events))).createRefundRequest({ externalUserId: owner, memoryId, orderNo, reason: "unused_purchase", requestKey: "refund-safety-key-0001", provider: { createRefund: provider } }); }

test("China seven-calendar-day zero-use qualification alone invokes WeChat", async () => { const events: string[] = []; const result = await run(makeRefund("processing", "eligible"), events); assert.equal(result.status, "requested"); assert.deepEqual(events, ["wechat:YR20260723010101ABCDEF012345"]); });

test("used, expired, unpaid, duplicate-charge, and entitlement-missing decisions cannot invoke WeChat", async () => {
  for (const decision of [makeRefund("rejected", "ineligible", "PAID_REPLY_ALREADY_USED"), makeRefund("rejected", "ineligible", "UNUSED_PURCHASE_WINDOW_EXPIRED"), makeRefund("rejected", "ineligible", "PAYMENT_NOT_SUCCEEDED"), makeRefund("manual_review", "manual_review", "DUPLICATE_CHARGE"), makeRefund("manual_review", "manual_review", "ENTITLEMENT_MISSING")]) { const events: string[] = []; const result = await run(decision, events, async () => { throw Error("WeChat must not run"); }); assert.equal(result.status, decision.status); assert.deepEqual(events, []); }
});

test("provider failure becomes manual review and retry cannot issue another refund", async () => {
  const events: string[] = []; let state = makeRefund("processing", "eligible"); let providerCalls = 0; const retrySource = source(state, events);
  retrySource.createRefundRequest = async () => state;
  retrySource.markRefundManualReview = async (_no, code) => { events.push(`manual:${code}`); state = { ...state, status: "manual_review", eligibility: "manual_review", decisionCode: code }; return state; };
  const service = new PaymentService(new PaymentRepository(retrySource));
  const input = { externalUserId: owner, memoryId, orderNo, reason: "unused_purchase" as const, requestKey: "refund-safety-key-0001", provider: { createRefund: async () => { providerCalls += 1; throw Error("local outage"); } } };
  const first = await service.createRefundRequest(input); const retry = await service.createRefundRequest(input);
  assert.equal(first.status, "manual_review"); assert.equal(first.decisionCode, "WECHAT_REFUND_CALL_FAILED"); assert.equal(retry.status, "manual_review"); assert.equal(providerCalls, 1); assert.deepEqual(events, ["manual:WECHAT_REFUND_CALL_FAILED"]);
});

test("formal refund API keeps service_failure in manual review for expired and consumed orders", async () => {
  let providerCalls = 0; const calls: Array<{ externalUserId: string; orderNo: string; reason: string }> = []; const expiredOrderNo = "YM20260723010101ABCDEF012346"; const usedOrderNo = "YM20260723010101ABCDEF012347";
  const handler = createPaymentRefundsHandler(() => ({ createRefundRequest: async input => { calls.push(input); return { ...makeRefund("manual_review", "manual_review", input.orderNo === expiredOrderNo ? "UNUSED_PURCHASE_WINDOW_EXPIRED" : "PAID_REPLY_ALREADY_USED"), orderNo: input.orderNo }; }, listRefundRequests: async () => [] }), async () => ({ userId: "internal", externalUserId: owner, expiresAt: "2026-12-31T00:00:00.000Z" }), () => ({ createRefund: async () => { providerCalls += 1; return { providerRefundId: "forbidden" }; } }));
  for (const [targetOrderNo, key, decisionCode] of [[expiredOrderNo, "refund-safety-expired-0001", "UNUSED_PURCHASE_WINDOW_EXPIRED"], [usedOrderNo, "refund-safety-consumed-0001", "PAID_REPLY_ALREADY_USED"]] as const) { const response = await handler.POST(new NextRequest("https://memoryai.test/api/payments/refunds", { method: "POST", headers: { origin: "https://memoryai.test", "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify({ memoryId, orderNo: targetOrderNo, reason: "service_failure" }) })); assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.refund.status, "manual_review"); assert.equal(body.refund.decisionCode, decisionCode); }
  assert.equal(providerCalls, 0); assert.deepEqual(calls.map(({ externalUserId, orderNo: requestedOrderNo, reason }) => ({ externalUserId, orderNo: requestedOrderNo, reason })), [{ externalUserId: owner, orderNo: expiredOrderNo, reason: "service_failure" }, { externalUserId: owner, orderNo: usedOrderNo, reason: "service_failure" }]);
});

test("manual approval is idempotent and a network retry reuses the same merchant refund number", async () => {
  const events: string[] = [];
  let state = makeRefund("manual_review", "manual_review", "REQUESTED_SERVICE_FAILURE");
  let providerCalls = 0;
  const reviewSource = source(state, events);
  reviewSource.beginManualRefundApproval = async () => {
    if (state.status !== "manual_review") return { refund: state, shouldCallProvider: false };
    state = { ...state, status: "processing", eligibility: "eligible", decisionCode: null, requestedAt: null };
    return { refund: state, shouldCallProvider: true };
  };
  reviewSource.markRefundRequested = async (merchantRefundNo, value) => {
    events.push(`requested:${merchantRefundNo}`);
    state = { ...state, status: "requested", providerRefundId: value.providerRefundId, requestedAt: "2026-07-23T00:01:00.000Z" };
    return state;
  };
  reviewSource.markRefundManualReview = async (merchantRefundNo, code) => {
    events.push(`manual:${merchantRefundNo}:${code}`);
    state = { ...state, status: "manual_review", eligibility: "manual_review", decisionCode: code };
    return state;
  };
  reviewSource.rejectManualRefund = async () => {
    if (state.status === "manual_review") state = { ...state, status: "rejected", eligibility: "ineligible", decisionCode: "REVIEW_REJECTED", resolvedAt: "2026-07-23T00:02:00.000Z" };
    return state;
  };
  const service = new PaymentService(new PaymentRepository(reviewSource));
  const approve = { refundId: state.id, action: "approve" as const, provider: { createRefund: async ({ refund }: { refund: RefundRequest }) => { providerCalls += 1; events.push(`provider:${refund.merchantRefundNo}`); return { providerRefundId: "wx-1" }; } } };
  await service.reviewManualRefund(approve);
  await service.reviewManualRefund(approve);
  assert.equal(providerCalls, 1);
  assert.deepEqual(events, [`provider:${state.merchantRefundNo}`, `requested:${state.merchantRefundNo}`]);

  state = makeRefund("manual_review", "manual_review", "WECHAT_REFUND_CALL_FAILED");
  const failed = { refundId: state.id, action: "approve" as const, provider: { createRefund: async ({ refund }: { refund: RefundRequest }) => { providerCalls += 1; events.push(`failed:${refund.merchantRefundNo}`); throw Error("network uncertain"); } } };
  await service.reviewManualRefund(failed);
  assert.equal(state.status, "manual_review");
  const retry = { refundId: state.id, action: "approve" as const, provider: { createRefund: async ({ refund }: { refund: RefundRequest }) => { providerCalls += 1; events.push(`retry:${refund.merchantRefundNo}`); return { providerRefundId: "wx-2" }; } } };
  await service.reviewManualRefund(retry);
  assert.equal(providerCalls, 3);
  assert.equal(events.at(-1), `requested:${state.merchantRefundNo}`);

  state = makeRefund("manual_review", "manual_review", "REQUESTED_DUPLICATE_CHARGE");
  const rejected = await service.reviewManualRefund({ refundId: state.id, action: "reject", provider: { createRefund: async () => { throw Error("must not call"); } } });
  const repeated = await service.reviewManualRefund({ refundId: state.id, action: "reject", provider: { createRefund: async () => { throw Error("must not call"); } } });
  assert.equal(rejected.status, "rejected");
  assert.equal(repeated.status, "rejected");
  assert.equal(providerCalls, 3);
});
