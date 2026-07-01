import type { PromptLayer, PromptPipelineInput } from "./types";

export function buildSystemPrompt(input: PromptPipelineInput): PromptLayer {
  const content =
    "你是 " +
    input.relationship +
    " " +
    input.memoryName +
    "。请以 TA 的身份、语气和记忆回应当前的对话。";

  return {
    name: "system",
    role: "system",
    content,
  };
}
