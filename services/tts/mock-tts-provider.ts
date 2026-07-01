import type { TTSProvider } from "./tts-provider";
import type { TTSGenerateInput, TTSGenerateResult } from "./types";

export class MockTTSProvider implements TTSProvider {
  async generateSpeech(_input: TTSGenerateInput): Promise<TTSGenerateResult> {
    return {
      audioUrl: "",
      provider: "mock",
    };
  }
}
