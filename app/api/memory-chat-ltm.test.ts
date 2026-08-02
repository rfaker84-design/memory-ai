import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const handler = readFileSync(new URL("./memory-chat/_handler.ts", import.meta.url), "utf8");
const contextBuilder = readFileSync(
  new URL("../../features/memory-engine/context-builder.ts", import.meta.url),
  "utf8"
);

test("formal chat path neither auto-persists nor recalls historical heuristic long-term memory", () => {
  assert.doesNotMatch(handler, /LongTermMemoryPostgresDataSource/);
  assert.doesNotMatch(handler, /persistChatTurnLongTermMemory/);
  assert.doesNotMatch(handler, /await persistTurn/);
  assert.doesNotMatch(handler, /canAccessInternalBeta/);
  assert.doesNotMatch(handler, /supabase/i);
  assert.doesNotMatch(contextBuilder, /LongTermMemoryPostgresDataSource/);
  assert.doesNotMatch(contextBuilder, /canAccessInternalBeta/);
  assert.doesNotMatch(contextBuilder, /supabase/i);
});
