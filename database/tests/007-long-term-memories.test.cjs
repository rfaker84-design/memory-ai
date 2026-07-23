const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("migrations/007_long_term_memories.sql");
const postflight = read("verification/007-long-term-memories-postflight.sql");
const runner = read("../scripts/postgresql/apply-migrations.sh");

test("007 long-term-memory catalog is transactional, authoritative, and ordered before 008", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /SET LOCAL lock_timeout = '2s';/);
  assert.match(migration, /SET LOCAL statement_timeout = '15min';/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.long_term_memories/);
  for (const column of [
    "memory_id", "content", "content_hash", "source_type", "source_id",
    "importance", "tags", "metadata", "created_at", "updated_at",
  ]) assert.match(migration, new RegExp(`\\b${column}\\b`));
  assert.match(migration, /fk_long_term_memories_memory/);
  assert.match(migration, /UNIQUE \(memory_id, source_type, content_hash\)/);
  assert.match(migration, /idx_long_term_memories_memory_importance_created/);
  assert.match(migration, /\(memory_id, importance DESC, created_at DESC\)/);
  assert.doesNotMatch(migration, /\buser_id\b|\bexternal_user_id\b/i);
  assert.ok(runner.indexOf("006_auth_verification_challenges.sql") < runner.indexOf("007_long_term_memories.sql"));
  assert.ok(runner.indexOf("007_long_term_memories.sql") < runner.indexOf("008_memory_first_greetings.sql"));
  assert.equal(fs.existsSync(path.join(root, "migrations", "009_long_term_memories.sql")), false);
});

test("007 postflight is read-only and verifies dedupe and recall indexes", () => {
  assert.match(postflight, /^BEGIN READ ONLY;/);
  assert.match(postflight, /content deduplication constraint is invalid/);
  assert.match(postflight, /recall index is invalid/);
  assert.match(postflight, /COMMIT;\s*$/);
  assert.doesNotMatch(postflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
});
