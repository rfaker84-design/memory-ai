const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(path.join(__dirname, "..", "migrations", "030_product_metrics_cost_foundation.sql"), "utf8");

test("030 creates narrow, environment-scoped and idempotent metrics facts", () => {
  for (const name of ["product_interaction_events", "product_metrics_subject_flags", "product_first_touch_attributions", "cost_rate_cards", "cost_ledger_entries", "campaign_spend_imports", "product_metrics_coverage"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name}`));
  }
  assert.match(migration, /ux_product_interaction_events_idempotency/);
  assert.match(migration, /UNIQUE \(environment, idempotency_key\)/);
  assert.match(migration, /cost_ledger_entries is append-only/);
  assert.match(migration, /environment = 'staging' AND amount_minor = 0/);
});

test("030 cannot provide a storage field for protected user content or media locators", () => {
  const interactionStart = migration.indexOf("CREATE TABLE IF NOT EXISTS public.product_interaction_events");
  const interactionTable = migration.slice(interactionStart, migration.indexOf("-- A formal test/internal", interactionStart));
  for (const forbidden of ["phone", "content TEXT", "photo_url", "storage_key", "cos_key", "birthday", "message_body"]) {
    assert.doesNotMatch(interactionTable, new RegExp(forbidden, "i"));
  }
  assert.match(migration, /memoryai_metrics_properties_allowed/);
  assert.match(migration, /event_name IN/);
});
