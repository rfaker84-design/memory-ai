import type { PromptLayer, PromptPipelineInput } from "./types";

export function buildUserPrompt(input: PromptPipelineInput): PromptLayer {
  return {
    name: "user",
    role: "user",
    content: input.userMessage,
  };
}
