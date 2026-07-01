import type { PromptLayer, PromptPipelineInput, PromptPipelineResult } from "./types";
import { buildSystemPrompt } from "./system-prompt";
import { buildSafetyPrompt } from "./safety-prompt";
import { buildRelationshipPrompt } from "./relationship-prompt";
import { buildEmotionPrompt } from "./emotion-prompt";
import { buildMemoryPrompt } from "./memory-prompt";
import { buildConversationPrompt } from "./conversation-prompt";
import { buildUserPrompt } from "./user-prompt";

export function buildPromptPipeline(
  input: PromptPipelineInput
): PromptPipelineResult {
  const layers: PromptLayer[] = [
    buildSystemPrompt(input),
    buildSafetyPrompt(input),
    buildRelationshipPrompt(input),
    buildEmotionPrompt(input),
    buildMemoryPrompt(input),
    buildConversationPrompt(input),
    buildUserPrompt(input),
  ];

  // Multipart system: join all system-role layers into one, then user message
  const systemContent = layers
    .filter((l) => l.role === "system")
    .map((l) => l.content)
    .join("\n\n");

  const userLayer = layers.find((l) => l.role === "user");

  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: systemContent },
  ];

  if (userLayer) {
    messages.push({ role: "user", content: userLayer.content });
  }

  return { layers, messages };
}
