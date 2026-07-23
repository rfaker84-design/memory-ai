const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("migrations/010_memory_experience_payments.sql");
const postflight = read("verification/010-memory-experience-payments-postflight.sql");
const runner = read("../scripts/postgresql/apply-migrations.sh");

test("010 payment migration is transactional, owner-bound, and follows 009", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  for (const table of ["payment_orders", "memory_entitlements", "memory_entitlement_usages", "payment_callback_events"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  }
  assert.match(migration, /FOREIGN KEY \(user_id\) REFERENCES public\.users/);
  assert.match(migration, /FOREIGN KEY \(memory_id\) REFERENCES public\.memories/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS ux_payment_orders_owner_memory_request/);
  assert.match(migration, /\(user_id, memory_id, request_key\)/);
  assert.match(migration, /UNIQUE \(provider, provider_event_id\)/);
  assert.match(migration, /UNIQUE \(order_id\)/);
  assert.match(migration, /UNIQUE \(user_id, memory_id, idempotency_key\)/);
  assert.match(migration, /status IN \('pending', 'paid', 'failed', 'cancelled', 'refunded', 'expired'\)/);
  assert.ok(runner.indexOf("009_memory_chat_turn_idempotency.sql") < runner.indexOf("010_memory_experience_payments.sql"));
});

test("010 postflight is read-only and checks idempotency plus grant integrity", () => {
  assert.match(postflight, /^BEGIN READ ONLY;/);
  assert.match(postflight, /order idempotency index is invalid/);
  assert.match(postflight, /paid order is missing provider settlement evidence/);
  assert.match(postflight, /an order granted multiple entitlements/);
  assert.match(postflight, /entitlement usage ownership is invalid/);
  assert.match(postflight, /COMMIT;\s*$/);
  assert.doesNotMatch(postflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
});
