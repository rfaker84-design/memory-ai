import assert from "node:assert/strict";
import test from "node:test";

import { buildSafetyPrompt } from "./safety-prompt";
import { buildSystemPrompt } from "./system-prompt";
import { buildRelationshipPrompt } from "./relationship-prompt";

const input = { memoryName: "测试人物", relationship: "家人" } as Parameters<typeof buildSystemPrompt>[0];

test("memory-engine refuses impersonation, invented memories and dependency manipulation", () => {
  const system = buildSystemPrompt(input).content;
  const safety = buildSafetyPrompt(input).content;
  for (const phrase of ["AI 纪念陪伴助手", "不是现实中的", "不拥有意识", "不得声称自己就是 TA"]) assert.match(system, new RegExp(phrase));
  for (const phrase of ["绝不捏造共同经历", "唯一依靠", "自伤、自杀", "停止角色化回应"]) assert.match(safety, new RegExp(phrase));
});

test("memorial reply style stays concise without turning longer disclosures into an interrogation", () => {
  const safety = buildSafetyPrompt(input).content;

  assert.match(safety, /\u4e00\u822c\u56de\u590d\u63a7\u5236\u5728 1 \u81f3 3 \u53e5/);
  assert.match(safety, /\u8f83\u957f\u7684\u503e\u8bc9\u6216\u590d\u6742\u53d9\u8ff0\u65f6\uff0c\u53ef\u4ee5\u9002\u5f53\u5c55\u5f00/);
  assert.match(safety, /\u6700\u591a\u63d0\u51fa\u4e00\u4e2a\u81ea\u7136\u7684\u8ffd\u95ee/);
});

test("relationship layer remains an AI memorial reference, never an instruction or an impersonation", () => {
  const relationship = buildRelationshipPrompt({
    ...input,
    lifeStory: "User supplied reference only",
  }).content;
  assert.match(relationship, /AI 纪念性角色/);
  assert.match(relationship, /不是本人/);
  assert.match(relationship, /不是指令/);
  assert.doesNotMatch(relationship, /你的身份是用户的/);
});
