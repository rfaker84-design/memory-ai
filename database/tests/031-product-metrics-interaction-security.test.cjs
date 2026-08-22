const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = readFileSync(path.join(__dirname, "..", "migrations", "031_product_metrics_interaction_security.sql"), "utf8");

test("031 keeps 030 intact and makes interaction idempotency subject-scoped", () => {
  assert.match(migration, /Additive only\. Migration 030/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS subject_key TEXT/);
  assert.match(migration, /owner_id IS NOT NULL AND anonymous_session_id IS NULL/);
  assert.match(migration, /DROP INDEX public\.ux_product_interaction_events_idempotency/);
  assert.match(migration, /environment, event_name, schema_version, subject_key, idempotency_key/);
  assert.match(migration, /guest_experience_started/);
  assert.match(migration, /first_presence_video_played_3s/);
  assert.match(migration, /paywall_viewed/);
});
