const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("015 creates one owner-memory default-session invariant and preserves dependent history", () => {
  const migration = read("migrations/015_chat_default_session_atomicity.sql");
  const postflight = read("verification/015-chat-default-session-atomicity-postflight.sql");
  const runner = read("../scripts/postgresql/apply-migrations.sh");

  assert.match(migration, /\nBEGIN;/);
  assert.match(migration, /SET LOCAL lock_timeout = '2s';/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /FIRST_VALUE\(c\.id\) OVER/);
  assert.match(migration, /memory_first_greetings greeting[\s\S]*greeting\.status = 'completed'/);
  assert.match(migration, /UPDATE public\.messages message[\s\S]*SET conversation_id = mapped\.canonical_id/);
  assert.match(migration, /UPDATE public\.memory_first_greetings greeting[\s\S]*SET conversation_id = mapped\.canonical_id/);
  assert.match(migration, /UPDATE public\.memory_chat_turns turn[\s\S]*SET conversation_id = mapped\.canonical_id/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS ux_conversations_default_owner_memory[\s\S]*WHERE is_default/);
  assert.match(migration, /refuses messages with conversation ownership mismatch/);
  assert.match(migration, /COMMIT;\s*$/);

  assert.match(postflight, /^BEGIN READ ONLY;/);
  assert.match(postflight, /multiple default conversations/);
  assert.match(postflight, /message conversation ownership mismatch/);
  assert.match(postflight, /first greeting conversation ownership mismatch/);
  assert.match(postflight, /chat turn conversation ownership mismatch/);
  assert.doesNotMatch(postflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);

  const integration = read("../features/chat/chat-session-atomicity.integration.test.ts");
  assert.match(integration, /current_setting\('server_version'\)/);
  assert.match(integration, /\^14\\\.23/);

  assert.ok(
    runner.indexOf("014_commerce_credits_referrals.sql") === -1,
    "015 remains an approval-gated isolated migration alongside 014",
  );
  assert.equal(runner.includes("015_chat_default_session_atomicity.sql"), false);
});
