export interface EmbeddingInput {
  texts: string[];
  model?: string;
}

export interface EmbeddingResult {
  embeddings: number[][];
  provider: string;
  model?: string;
}
