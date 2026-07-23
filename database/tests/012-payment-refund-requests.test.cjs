const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("012 refund requests retain one owner-bound application and explicit lifecycle", () => {
  const migration = read("migrations/012_payment_refund_requests.sql");
  const runner = read("../scripts/postgresql/apply-migrations.sh");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.refund_requests/);
  assert.match(migration, /REFERENCES public\.payment_orders\(id\)/);
  assert.match(migration, /uq_refund_requests_order UNIQUE \(order_id\)/);
  assert.match(migration, /status IN \('processing', 'succeeded', 'rejected'\)/);
  assert.match(migration, /eligibility IN \('eligible', 'ineligible'\)/);
  assert.ok(runner.indexOf("011_business_funnel_events.sql") < runner.indexOf("012_payment_refund_requests.sql"));
});
