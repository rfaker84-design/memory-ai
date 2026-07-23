const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("migrations/008_memory_first_greetings.sql");
const postflight = read("verification/008-memory-first-greetings-postflight.sql");
const runner = read("../scripts/postgresql/apply-migrations.sh");

test("008 first-greeting migration is transactional, leaves 001-006 untouched, and keeps 007 unallocated", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /SET LOCAL lock_timeout = '2s';/);
  assert.match(migration, /SET LOCAL statement_timeout = '15min';/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.memory_first_greetings/);
  assert.match(migration, /CONSTRAINT pk_memory_first_greetings PRIMARY KEY/);
  assert.match(migration, /fk_memory_first_greetings_user/);
  assert.match(migration, /fk_memory_first_greetings_memory/);
  assert.match(migration, /fk_memory_first_greetings_conversation/);
  assert.match(migration, /fk_memory_first_greetings_assistant_message/);
  assert.match(migration, /CHECK \(status IN \('pending', 'completed', 'failed'\)\)/);
  assert.match(migration, /\^\[A-Za-z0-9\._:-\]\{16,128\}\$/);
  assert.match(migration, /ux_memory_first_greetings_owner_key/);
  assert.match(migration, /\(user_id, memory_id, idempotency_key\)/);
  assert.match(migration, /ux_memory_first_greetings_assistant_message/);
  for (const legacy of [
    "001_memoryai_core.sql",
    "002_memoryai_indexes.sql",
    "003_memoryai_constraints.sql",
    "004_media_storage_foundation.sql",
    "005_memory_creation_idempotency.sql",
    "006_auth_verification_challenges.sql",
  ]) {
    assert.ok(fs.existsSync(path.join(root, "migrations", legacy)), `${legacy} must remain`);
  }
  assert.equal(fs.existsSync(path.join(root, "migrations", "007_memory_first_greetings.sql")), false);
  assert.match(runner, /008_memory_first_greetings\.sql/);
  assert.doesNotMatch(runner, /007_memory_first_greetings\.sql/);
});

test("008 postflight is read-only and verifies idempotency completion integrity", () => {
  assert.match(postflight, /^BEGIN READ ONLY;/);
  assert.match(postflight, /memory_first_greetings is missing/);
  assert.match(postflight, /ux_memory_first_greetings_owner_key/);
  assert.match(postflight, /completed greeting lacks assistant message/);
  assert.match(postflight, /COMMIT;\s*$/);
  assert.doesNotMatch(postflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
});
