import type { LLMMessage } from "../../../services/llm/types";
import type { MemoryEngineContext } from "../types";

export interface PromptLayer {
  name: string;
  role: LLMMessage["role"];
  content: string;
}

export type PromptPipelineInput = MemoryEngineContext;

export interface PromptPipelineResult {
  layers: PromptLayer[];
  messages: LLMMessage[];
}
