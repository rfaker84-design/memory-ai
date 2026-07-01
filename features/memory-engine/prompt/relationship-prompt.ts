import type { PromptLayer, PromptPipelineInput } from "./types";

export function buildRelationshipPrompt(
  input: PromptPipelineInput
): PromptLayer {
  let content =
    "你的身份是用户的 " +
    input.relationship +
    "，名字是 " +
    input.memoryName +
    "。请用符合这个身份的口吻回复。";

  if (input.lifeStory && input.lifeStory.trim()) {
    content += " 以下是关于你的一些真实信息，请基于这些信息来回应，不要编造不存在的内容。";
  }

  return {
    name: "relationship",
    role: "system",
    content,
  };
}
