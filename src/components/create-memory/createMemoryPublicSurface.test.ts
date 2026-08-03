import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "src/components/create-memory/CreateMemoryExperience.tsx"),
  "utf8",
);

test("public TA creation collects only a portrait, not an audio or voice-clone asset", () => {
  assert.match(source, /首发只收集你选择提交的照片和文字资料，不收集声音文件，也不提供声音克隆/);
  assert.match(source, /accept="image\/\*"/);
  assert.doesNotMatch(source, /accept="audio\/\*"/);
  assert.doesNotMatch(source, /选择声音文件/);
});

test("creation copy keeps AI responses grounded in confirmed material", () => {
  assert.match(source, /未来回应越能贴近你确认的内容/);
  assert.match(source, /不是现实中的 TA/);
  assert.doesNotMatch(source, /逐渐清晰的存在体/);
});
