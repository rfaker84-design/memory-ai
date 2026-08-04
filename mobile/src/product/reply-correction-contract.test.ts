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
