import type { LLMGenerateInput, LLMGenerateResult } from "./types";

export interface LLMProvider {
  generate(input: LLMGenerateInput): Promise<LLMGenerateResult>;
}
