import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("TA profile editor reads and patches the formal owner-scoped memory resource", () => {
  assert.match(source, /loadOwnedMemory\(memoryId/);
  assert.match(source, /method: "PATCH"/);
  assert.match(source, /`\/api\/memories\/\$\{encodeURIComponent\(memoryId\)\}`/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /name: draft\.name\.trim\(\)/);
  assert.match(source, /relationship: draft\.relationship\.trim\(\)/);
  assert.match(source, /personalityProfile: nullable/);
  assert.match(source, /speechStyle: nullable/);
  assert.match(source, /catchPhrases: nullable/);
  assert.match(source, /lifeStory: nullable/);
  assert.match(source, /不会假称已保存/);
});

test("TA profile editor keeps historical chat immutable and exposes only confirmed-profile fields", () => {
  assert.match(source, /只填写你已确认的资料/);
  assert.match(source, /不会补全未知经历或改写历史内容/);
  assert.match(source, /只会影响之后的对话和影像，不会改写历史内容/);
  assert.doesNotMatch(source, /localStorage\.setItem/);
});
