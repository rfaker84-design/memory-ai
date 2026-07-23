const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("012 refund requests retain one owner-bound application and explicit lifecycle", () => {
  const migration = read("migrations/012_payment_refund_requests.sql");
  const postflight = read("verification/012-payment-refund-requests-postflight.sql");
  const runner = read("../scripts/postgresql/apply-migrations.sh");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.refund_requests/);
  assert.match(migration, /REFERENCES public\.payment_orders\(id\)/);
  assert.match(migration, /uq_refund_requests_order UNIQUE \(order_id\)/);
  assert.match(migration, /uq_refund_requests_merchant_refund_no UNIQUE \(merchant_refund_no\)/);
  assert.match(migration, /status IN \('processing', 'requested', 'manual_review', 'succeeded', 'rejected'\)/);
  assert.match(migration, /eligibility IN \('eligible', 'manual_review', 'ineligible'\)/);
  assert.match(migration, /Applicant-supplied explanation: it is never used as eligibility evidence/);
  assert.match(postflight, /^BEGIN READ ONLY;/);
  assert.match(postflight, /refund order idempotency is invalid/);
  assert.match(postflight, /merchant refund idempotency is invalid/);
  assert.match(postflight, /refund ownership is invalid/);
  assert.match(postflight, /COMMIT;\s*$/);
  assert.doesNotMatch(postflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
  assert.ok(runner.indexOf("011_business_funnel_events.sql") < runner.indexOf("012_payment_refund_requests.sql"));
});
