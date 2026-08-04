const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "migrations", "027_notification_preferences.sql"), "utf8");
const postflight = fs.readFileSync(path.join(root, "verification", "027-notification-preferences-postflight.sql"), "utf8");
const runner = fs.readFileSync(path.join(root, "..", "scripts", "postgresql", "apply-migrations.sh"), "utf8");

test("Migration 027 is a candidate-only, minimal notification preference contract", () => {
  assert.match(migration, /CANDIDATE ONLY/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.notification_preferences/);
  assert.match(migration, /user_id UUID PRIMARY KEY REFERENCES public\.users\(id\) ON DELETE CASCADE/);
  assert.match(migration, /greeting_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.doesNotMatch(migration, /device_token|subscription|endpoint|message_body/i);
  assert.doesNotMatch(runner, /027_notification_preferences\.sql/);
  assert.match(postflight, /BEGIN TRANSACTION READ ONLY/);
  assert.match(postflight, /invalid_indexes/);
  assert.match(postflight, /unvalidated_constraints/);
});
