import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./memory-chat-turn-postgres-datasource.ts", import.meta.url),
  "utf8"
);

test("chat turn claim serializes owner-memory scope and replays completed results", () => {
  assert.match(source, /lockTurnScope/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /JOIN users u ON u\.id = m\.user_id/);
  assert.match(source, /WHERE m\.id = \$1 AND u\.external_id = \$2/);
  assert.match(source, /status: "replayed"/);
  assert.match(source, /status: "in_progress"/);
  assert.match(source, /turn\.status !== "failed"/);
});

test("chat turn completion writes both messages, completion state, and conversation in one transaction", () => {
  const complete = source.slice(source.indexOf("async complete"));
  assert.match(complete, /withPostgresTransaction/);
  assert.match(complete, /"user"/);
  assert.match(complete, /"assistant"/);
  assert.match(complete, /SET status = 'completed', user_message_id = \$4, assistant_message_id = \$5/);
  assert.match(complete, /UPDATE conversations SET last_message_at = NOW\(\), updated_at = NOW\(\)/);
});

test("provider failures can mark a pending turn failed without persisting messages", () => {
  const fail = source.slice(source.indexOf("async fail"));
  assert.match(fail, /SET status = 'failed'/);
  assert.match(fail, /AND status = 'pending'/);
  assert.doesNotMatch(fail, /INSERT INTO messages/);
});
