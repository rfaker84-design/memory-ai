import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("mobile assistant replies expose a confirmed correction flow instead of a local-only complaint", () => {
  assert.match(app, /message\.role === "assistant"[\s\S]*?这句话不太像 \{memory\.name\}/);
  assert.match(app, /REPLY_CORRECTION_REASONS\.map/);
  assert.match(app, /createReplyCorrectionSuggestion\(replyCorrectionReason, replyCorrectionDetail, replyCorrectionContent\)/);
  assert.match(app, /只有确认后才会写入 TA 的正式资料；这不会改写已经发生的对话/);
});

test("mobile correction reads the formal owner-bound TA profile before an idempotent PATCH", () => {
  assert.match(api, /async appendConfirmedReplyCorrection[\s\S]*?await this\.getMemory\(memoryId\)/);
  assert.match(api, /currentValue\?\.includes\(suggestion\.text\)\) return current/);
  assert.match(api, /method: "PATCH"/);
  assert.match(api, /appendConfirmedCorrection\(currentValue, suggestion\.text\)/);
  assert.match(app, /await productApi\.appendConfirmedReplyCorrection\(memory\.id, replyCorrectionSuggestion\)/);
});

test("mobile exposes a source link only for server-persisted confirmed pickup references", () => {
  assert.match(app, /function confirmedPickupSourceIds\(metadata: Record<string, unknown> \| null \| undefined\)/);
  assert.match(app, /source\.sourceKind !== "user_confirmed_pickup"/);
  assert.match(app, /查看记忆来源/);
  assert.match(app, /setHighlightedPickupIds\(sourceIds\); setScreen\("memory"\)/);
  assert.match(app, /data-memory-source-highlighted/);
});
