import assert from "node:assert/strict";
import test from "node:test";

import { buildMemoryPrompt } from "./memory-prompt";

test("memory prompt carries the confirmed address, phrases, speaking habit, and shared memory", () => {
  const prompt = buildMemoryPrompt({
    memoryId: "memory-1",
    userId: "owner-1",
    sessionId: "session-1",
    userMessage: "你好",
    memoryName: "妈妈",
    relationship: "母亲",
    personalityProfile: "用户确认称呼 TA 为：妈妈。",
    catchPhrases: "别着急，慢慢来。",
    speechStyle: "说话轻柔，先安慰再给建议。",
    lifeStory: "一起在厨房做过生日面。",
    fragments: [],
    timeline: [],
    history: [],
    recentMessages: [],
    emotion: "neutral",
    emotionIntensity: "low",
    suggestedTone: "温和",
    aiCompanionMode: "guide",
    aiResponseStyle: "温和",
    longTermMemories: [],
    confirmedPickupSources: [],
  });

  for (const value of ["用户确认称呼 TA 为：妈妈。", "别着急，慢慢来。", "说话轻柔，先安慰再给建议。", "一起在厨房做过生日面。"]) {
    assert.match(prompt.content, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(prompt.content, /不得以通用模板替代/);
});

test("memory prompt accepts only the separately supplied confirmed pickup source set", () => {
  const prompt = buildMemoryPrompt({
    memoryId: "memory-1", userId: "owner-1", sessionId: "session-1", userMessage: "你好",
    memoryName: "妈妈", relationship: "母亲", fragments: [], timeline: [], history: [], recentMessages: [],
    emotion: "neutral", emotionIntensity: "low", suggestedTone: "温和", aiCompanionMode: "guide", aiResponseStyle: "温和",
    longTermMemories: ["雨天接送的已确认回忆。"],
    confirmedPickupSources: [{ id: "11111111-1111-4111-8111-111111111111", sourceKind: "user_confirmed_pickup" }],
  });
  assert.match(prompt.content, /拾忆/);
  assert.match(prompt.content, /雨天接送的已确认回忆。/);
  assert.match(prompt.content, /不能补充或外推/);
});

test("continuous chat keeps each TA's personality facts isolated", () => {
  const promptFor = (memoryId: string, prefix: string) => buildMemoryPrompt({
    memoryId,
    userId: "owner-1",
    sessionId: "session-1",
    userMessage: "How are you?",
    memoryName: `${prefix} name`,
    relationship: "friend",
    personalityProfile: `${prefix}_PERSONALITY`,
    catchPhrases: `${prefix}_CATCHPHRASE`,
    speechStyle: `${prefix}_STYLE`,
    lifeStory: `${prefix}_LIFE_STORY`,
    fragments: [],
    timeline: [],
    history: [],
    recentMessages: [],
    emotion: "neutral",
    emotionIntensity: "low",
    suggestedTone: "warm",
    aiCompanionMode: "guide",
    aiResponseStyle: "warm",
    longTermMemories: [],
    confirmedPickupSources: [],
  }).content;

  const firstTaPrompt = promptFor("ta-first", "FIRST_TA");
  const secondTaPrompt = promptFor("ta-second", "SECOND_TA");

  assert.match(firstTaPrompt, /FIRST_TA_(PERSONALITY|CATCHPHRASE|STYLE|LIFE_STORY)/);
  assert.doesNotMatch(firstTaPrompt, /SECOND_TA_(PERSONALITY|CATCHPHRASE|STYLE|LIFE_STORY)/);
  assert.match(secondTaPrompt, /SECOND_TA_(PERSONALITY|CATCHPHRASE|STYLE|LIFE_STORY)/);
  assert.doesNotMatch(secondTaPrompt, /FIRST_TA_(PERSONALITY|CATCHPHRASE|STYLE|LIFE_STORY)/);
});
