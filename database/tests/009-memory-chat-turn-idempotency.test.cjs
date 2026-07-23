const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("migrations/009_memory_chat_turn_idempotency.sql");
const postflight = read("verification/009-memory-chat-turn-idempotency-postflight.sql");
const runner = read("../scripts/postgresql/apply-migrations.sh");

test("009 chat-turn migration is transactional and follows 008", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /SET LOCAL lock_timeout = '2s';/);
  assert.match(migration, /SET LOCAL statement_timeout = '15min';/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.memory_chat_turns/);
  for (const column of [
    "user_id", "memory_id", "conversation_id", "idempotency_key", "request_hash",
    "status", "user_message_id", "assistant_message_id",
  ]) assert.match(migration, new RegExp(`\\b${column}\\b`));
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS ux_memory_chat_turns_owner_key/);
  assert.match(migration, /\(user_id, memory_id, idempotency_key\)/);
  assert.match(migration, /status = 'completed' AND user_message_id IS NOT NULL AND assistant_message_id IS NOT NULL/);
  assert.ok(runner.indexOf("008_memory_first_greetings.sql") < runner.indexOf("009_memory_chat_turn_idempotency.sql"));
});

test("009 postflight is read-only and checks completed-turn integrity", () => {
  assert.match(postflight, /^BEGIN READ ONLY;/);
  assert.match(postflight, /idempotency index is invalid/);
  assert.match(postflight, /completed turn lacks persisted messages/);
  assert.match(postflight, /COMMIT;\s*$/);
  assert.doesNotMatch(postflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
});
