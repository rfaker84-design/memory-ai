import type { TTSGenerateInput, TTSGenerateResult } from "./types";

export interface TTSProvider {
  generateSpeech(input: TTSGenerateInput): Promise<TTSGenerateResult>;
}
