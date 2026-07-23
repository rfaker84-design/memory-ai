import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./_handler.ts", import.meta.url), "utf8");

test("memory-chat accepts only memoryId and question plus an Idempotency-Key", () => {
  assert.match(source, /type MemoryChatRequest = \{ memoryId: string; question: string \}/);
  assert.match(source, /idempotency-key/);
  assert.match(source, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(source, /INVALID_IDEMPOTENCY_KEY/);
  assert.match(source, /keys\.length !== 2/);
  assert.match(source, /key === "memoryId" \|\| key === "question"/);
  assert.match(source, /INVALID_REQUEST/);
  assert.match(source, /Array\.from\(question\)\.length > 4_000/);
  assert.match(source, /isSafeQuestion/);
  assert.match(source, /script/);
  assert.match(source, /on\[a-z\]\+/);
  assert.match(source, /javascript/);
  assert.doesNotMatch(source, /history\??:/);
  assert.doesNotMatch(source, /user_phone|memory_id/);
});

test("memory-chat replays completed turns and holds unknown processing state", () => {
  assert.match(source, /claim\.status === "replayed"/);
  assert.match(source, /return response\(claim\.result\)/);
  assert.match(source, /claim\.status === "in_progress"/);
  assert.match(source, /CHAT_TURN_IN_PROGRESS/);
  assert.ok(source.indexOf('claim.status === "in_progress"') < source.indexOf("engineServiceFactory().generateReply"));
});

test("provider failure is explicitly retryable while completion precedes LTM persistence", () => {
  assert.match(source, /await turnService\.fail\(turnInput\)/);
  assert.match(source, /AI_UNAVAILABLE/);
  assert.match(source, /const result = await turnService\.complete/);
  assert.match(source, /await persistTurn/);
  assert.ok(source.indexOf("turnService.complete") < source.indexOf("persistTurn({"));
  assert.match(source, /LTM_WRITE_FAILED/);
  assert.doesNotMatch(source, /addiction-score/);
  assert.doesNotMatch(source, /supabase/i);
});
