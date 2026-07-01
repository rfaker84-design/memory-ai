import { AIProviderType } from "../ai/provider-types";
import type { AIProvider } from "../ai/ai-provider";
import type { EmbeddingProvider } from "./embedding-provider";

export class EmbeddingAIProviderAdapter implements AIProvider {
  readonly providerType = AIProviderType.EMBEDDING;

  constructor(
    readonly providerName: string,
    readonly embeddingProvider: EmbeddingProvider
  ) {}
}
