const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "../migrations/014_commerce_credits_referrals.sql"),
  "utf8",
);
const runner = fs.readFileSync(
  path.join(__dirname, "../../scripts/postgresql/apply-migrations.sh"),
  "utf8",
);

test("014 keeps the formal commerce ledger in PostgreSQL", () => {
  for (const table of [
    "commerce_orders",
    "commerce_order_events",
    "commerce_refund_requests",
    "commerce_credit_lots",
    "commerce_generation_reservations",
    "commerce_save_rights",
    "commerce_photo_remedies",
    "commerce_referral_codes",
    "commerce_referral_qualifications",
    "commerce_referral_rewards",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  }
});

test("orders, callbacks, refunds, reservations, and referrals have database idempotency", () => {
  assert.match(migration, /uq_commerce_orders_user_request UNIQUE/);
  assert.match(migration, /uq_commerce_order_events_rail_event/);
  assert.match(migration, /uq_commerce_refund_requests_order UNIQUE/);
  assert.match(migration, /uq_commerce_generation_reservations_request/);
  assert.match(migration, /uq_commerce_referral_qualifications_invitee UNIQUE/);
  assert.match(migration, /uq_commerce_referral_qualifications_phone UNIQUE/);
  assert.match(migration, /uq_commerce_referral_qualifications_device UNIQUE/);
  assert.match(migration, /uq_commerce_referral_rewards_cohort/);
});

test("paid credits are permanent and non-paid credits cannot save", () => {
  assert.match(migration, /ck_commerce_credit_lots_permanent[\s\S]*expires_at IS NULL/);
  assert.match(migration, /source_kind = 'paid_package' AND save_allowed/);
  assert.match(migration, /source_kind <> 'paid_package' AND NOT save_allowed/);
});

test("iOS orders are constrained to StoreKit", () => {
  assert.match(migration, /platform <> 'ios' OR payment_rail = 'storekit_iap'/);
});

test("migration remains outside the automatic runner pending Window 1 approval", () => {
  assert.doesNotMatch(runner, /014_commerce_credits_referrals\.sql/);
});
