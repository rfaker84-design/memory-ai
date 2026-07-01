import type { LLMMessage } from "../../services/llm/types";
import type { MemoryEngineContext } from "./types";
import { buildPromptPipeline } from "./prompt/prompt-pipeline";

export interface PromptBuildResult {
  messages: LLMMessage[];
}

export class PromptBuilder {
  buildPrompt(context: MemoryEngineContext): PromptBuildResult {
    const result = buildPromptPipeline(context);
    return { messages: result.messages };
  }
}
