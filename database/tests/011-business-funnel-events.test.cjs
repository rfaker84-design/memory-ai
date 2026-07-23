const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("migrations/011_business_funnel_events.sql");
const postflight = read("verification/011-business-funnel-events-postflight.sql");
const runner = read("../scripts/postgresql/apply-migrations.sh");

test("011 business funnel migration is minimal, owner-bound, and follows 010", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.business_funnel_events/);
  assert.match(migration, /FOREIGN KEY \(user_id\) REFERENCES public\.users/);
  assert.match(migration, /FOREIGN KEY \(memory_id\) REFERENCES public\.memories/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS ux_business_funnel_events_type_key/);
  assert.match(migration, /\(event_type, event_key\)/);
  for (const event of ["login_completed", "memory_created", "first_greeting_viewed", "first_conversation_completed", "payment_entry_viewed", "order_created", "payment_completed", "payment_refunded"]) {
    assert.match(migration, new RegExp(`'${event}'`));
  }
  assert.ok(runner.indexOf("010_memory_experience_payments.sql") < runner.indexOf("011_business_funnel_events.sql"));
});

test("011 postflight is read-only and verifies event deduplication", () => {
  assert.match(postflight, /^BEGIN READ ONLY;/);
  assert.match(postflight, /funnel event deduplication index is invalid/);
  assert.match(postflight, /funnel time index is invalid/);
  assert.match(postflight, /COMMIT;\s*$/);
  assert.doesNotMatch(postflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
});
