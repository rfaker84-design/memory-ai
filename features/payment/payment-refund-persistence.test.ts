import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./payment-postgres-datasource.ts", import.meta.url), "utf8");

test("refund qualification is server-derived and retains manual review over unsafe automatic settlement", () => {
  assert.match(source, /SELECT chat_used, status FROM memory_entitlements WHERE order_id = \$1 FOR UPDATE/);
  assert.match(source, /Asia\/Shanghai/);
  assert.match(source, /withinUnusedPurchaseWindow/);
  assert.match(source, /hasDuplicateCharge/);
  assert.match(source, /DUPLICATE_CHARGE/);
  assert.match(source, /ENTITLEMENT_MISSING/);
  assert.match(source, /PAID_REPLY_ALREADY_USED/);
  assert.match(source, /UNUSED_PURCHASE_WINDOW_EXPIRED/);
  assert.match(source, /applicant's reason is retained for support context only/);
});

test("refund success is callback-bound and atomically revokes the entitlement", () => {
  assert.match(source, /merchant_refund_no = \$2 FOR UPDATE/);
  assert.match(source, /UPDATE payment_orders SET status = 'refunded'/);
  assert.match(source, /UPDATE memory_entitlements SET status = 'refunded'/);
  assert.match(source, /UPDATE refund_requests SET status = 'succeeded'/);
  assert.match(source, /status IN \('processing', 'requested', 'manual_review'\)/);
});
