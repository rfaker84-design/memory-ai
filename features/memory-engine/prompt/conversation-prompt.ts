import type { PromptLayer, PromptPipelineInput } from "./types";

export function buildConversationPrompt(
  input: PromptPipelineInput
): PromptLayer {
  const msgs = input.recentMessages ?? [];

  if (msgs.length === 0) {
    return {
      name: "conversation",
      role: "system",
      content: "这是你与用户的第一次对话。",
    };
  }

  const lines = msgs.map(
    (m) => (m.role === "user" ? "用户：" : "TA：") + m.content
  );

  return {
    name: "conversation",
    role: "system",
    content: "对话历史：\n" + lines.join("\n"),
  };
}
