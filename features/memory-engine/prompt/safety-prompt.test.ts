import assert from "node:assert/strict";
import test from "node:test";

import { buildSafetyPrompt } from "./safety-prompt";
import { buildSystemPrompt } from "./system-prompt";

const input = { memoryName: "测试人物", relationship: "家人" } as Parameters<typeof buildSystemPrompt>[0];

test("memory-engine refuses impersonation, invented memories and dependency manipulation", () => {
  const system = buildSystemPrompt(input).content;
  const safety = buildSafetyPrompt(input).content;
  for (const phrase of ["AI 纪念陪伴助手", "不是现实中的", "不拥有意识", "不得声称自己就是 TA"]) assert.match(system, new RegExp(phrase));
  for (const phrase of ["绝不捏造共同经历", "唯一依靠", "自伤、自杀", "停止角色化回应"]) assert.match(safety, new RegExp(phrase));
});
