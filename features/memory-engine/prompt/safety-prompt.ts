import type { PromptLayer, PromptPipelineInput } from "./types";

export function buildSafetyPrompt(_input: PromptPipelineInput): PromptLayer {
  // TODO: add safety constraints from configuration
  const content =
    "请保持尊重、温暖的交流。不要进行人身攻击，不要谈论敏感政治话题。";

  return {
    name: "safety",
    role: "system",
    content,
  };
}
