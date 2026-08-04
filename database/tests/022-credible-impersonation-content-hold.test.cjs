const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "migrations", "022_credible_impersonation_content_hold.sql"), "utf8");
const postflight = fs.readFileSync(path.join(root, "verification", "022-credible-impersonation-content-hold-postflight.sql"), "utf8");
const runner = fs.readFileSync(path.join(root, "..", "scripts", "postgresql", "apply-migrations.sh"), "utf8");

test("022 is a transactional candidate that holds only a reported public share and remains outside the automatic runner", () => {
  assert.match(migration, /^-- CANDIDATE ONLY[\s\S]*BEGIN;/);
  assert.match(migration, /022 requires candidate migrations 019 and 021/);
  assert.match(migration, /'public_share'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.content_visibility_holds/);
  assert.match(migration, /uq_content_visibility_holds_report/);
  assert.match(migration, /status IN \('hidden','restored'\)/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.doesNotMatch(runner, /022_credible_impersonation_content_hold/);
  assert.match(postflight, /BEGIN TRANSACTION READ ONLY/);
  assert.match(postflight, /ix_content_visibility_holds_active_share/);
});
