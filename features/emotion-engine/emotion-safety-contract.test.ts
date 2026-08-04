import assert from "node:assert/strict";
import test from "node:test";

import { AIEmotionBuilder } from "./ai-emotion-builder";
import { EmotionContextBuilder } from "./emotion-context-builder";
import { buildEmotionPrompt } from "../memory-engine/prompt/emotion-prompt";

test("emotion context does not tell a lonely user that AI is continuously present", () => {
  const context = new EmotionContextBuilder().build({ emotion: "lonely", intensity: "high", keywords: [] });
  const ai = new AIEmotionBuilder().build(context);
  assert.doesNotMatch(context.suggestedTone, /一直在身边/);
  assert.match(context.suggestedTone, /不宣称持续在场/);
  assert.doesNotMatch(ai.responseStyle, /一直在这里|永远陪伴/);
  assert.match(ai.responseStyle, /不得/);
});

test("emotion prompt preserves AI identity and blocks dependency or fabricated-memory claims", () => {
  const prompt = buildEmotionPrompt({
    memoryId: "memory-1",
    userId: "user-1",
    sessionId: "session-1",
    userMessage: "我很难过",
    memoryName: "小林",
    relationship: "家人",
    fragments: [],
    timeline: [],
    history: [],
    recentMessages: [],
    emotion: "grief",
    emotionIntensity: "high",
    suggestedTone: "温和回应",
    aiCompanionMode: "comfort",
    aiResponseStyle: "温和回应",
    longTermMemories: [],
  });
  assert.match(prompt.content, /AI 纪念陪伴/);
  assert.match(prompt.content, /不得宣称真实意识/);
  assert.match(prompt.content, /不得编造未确认资料/);
});
