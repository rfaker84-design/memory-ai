import { AIProviderType } from "../ai/provider-types";
import type { AIProvider } from "../ai/ai-provider";
import type { LLMProvider } from "./llm-provider";

export class LLMAIProviderAdapter implements AIProvider {
  readonly providerType = AIProviderType.LLM;

  constructor(
    readonly providerName: string,
    readonly llmProvider: LLMProvider
  ) {}
}
