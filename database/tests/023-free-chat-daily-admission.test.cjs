const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "migrations", "023_free_chat_daily_admission.sql"), "utf8");
const runner = fs.readFileSync(path.join(root, "..", "scripts", "postgresql", "apply-migrations.sh"), "utf8");

test("023 is a transactional manual-only ordinary-chat admission candidate", () => {
  assert.match(migration, /^-- CANDIDATE ONLY[\s\S]*BEGIN;/);
  assert.match(migration, /023 requires users, memories and memory_chat_turns/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.free_chat_daily_admissions/);
  assert.match(migration, /FOREIGN KEY \(memory_id, user_id\) REFERENCES public\.memories\(id, user_id\)/);
  assert.match(migration, /uq_free_chat_daily_admissions_request UNIQUE/);
  assert.match(migration, /status IN \('reserved', 'committed', 'released'\)/);
  assert.match(migration, /ix_free_chat_daily_admissions_owner_day_active/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.doesNotMatch(runner, /023_free_chat_daily_admission/);
});
