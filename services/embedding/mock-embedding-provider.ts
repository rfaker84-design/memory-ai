import type { EmbeddingProvider } from "./embedding-provider";
import type { EmbeddingInput, EmbeddingResult } from "./types";

export class MockEmbeddingProvider implements EmbeddingProvider {
  async embed(_input: EmbeddingInput): Promise<EmbeddingResult> {
    return {
      embeddings: [],
      provider: "mock",
    };
  }
}
