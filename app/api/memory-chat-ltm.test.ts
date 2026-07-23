import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const handler = readFileSync(new URL("./memory-chat/_handler.ts", import.meta.url), "utf8");
const contextBuilder = readFileSync(
  new URL("../../features/memory-engine/context-builder.ts", import.meta.url),
  "utf8"
);

test("formal chat path uses PostgreSQL LTM only after both messages persist", () => {
  assert.match(handler, /LongTermMemoryPostgresDataSource/);
  assert.match(handler, /persistChatTurnLongTermMemory/);
  assert.ok(handler.indexOf("const result = await turnService.complete") < handler.indexOf("await persistTurn"));
  assert.match(handler, /console\.warn\("\[memory-chat\] LTM_WRITE_FAILED"\)/);
  assert.doesNotMatch(handler, /supabase/i);
  assert.match(contextBuilder, /LongTermMemoryPostgresDataSource/);
  assert.doesNotMatch(contextBuilder, /supabase/i);
});
