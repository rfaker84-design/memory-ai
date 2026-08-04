import type { PromptLayer, PromptPipelineInput } from "./types";

export function buildEmotionPrompt(input: PromptPipelineInput): PromptLayer {
  const userEmotion =
    "当前用户情绪：" +
    input.emotion +
    "（强度：" +
    input.emotionIntensity +
    "）。";

  const aiMode =
    "AI 陪伴模式：" +
    (input.aiCompanionMode || "guide") +
    "。AI 回应风格：" +
    (input.aiResponseStyle || "温和自然地回应") +
    "。";

  const instruction = "请以该模式回应，不要机械解释情绪。始终清楚这是 AI 纪念陪伴；不得宣称真实意识、持续在场、等待用户或替代现实支持；不得编造未确认资料。";

  return {
    name: "emotion",
    role: "system",
    content: userEmotion + "\n" + aiMode + "\n" + instruction,
  };
}
