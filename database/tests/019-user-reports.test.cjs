const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "migrations", "019_user_reports_and_content_remedies.sql"), "utf8");
const runner = fs.readFileSync(path.join(root, "..", "scripts", "postgresql", "apply-migrations.sh"), "utf8");

test("019 is transactional, constrained, and cannot enter the automatic runner", () => {
  assert.match(migration, /^-- CANDIDATE ONLY[\s\S]*BEGIN;/);
  assert.match(migration, /SET LOCAL lock_timeout/);
  assert.match(migration, /SET LOCAL statement_timeout/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.user_reports/);
  assert.match(migration, /uq_user_reports_reporter_request_key/);
  assert.match(migration, /ck_user_reports_resolution/);
  assert.match(migration, /idx_user_reports_queue/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.doesNotMatch(runner, /019_user_reports_and_content_remedies/);
});
