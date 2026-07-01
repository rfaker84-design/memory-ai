import type { EmbeddingInput, EmbeddingResult } from "./types";

export interface EmbeddingProvider {
  embed(input: EmbeddingInput): Promise<EmbeddingResult>;
}
