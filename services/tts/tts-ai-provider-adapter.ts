import { AIProviderType } from "../ai/provider-types";
import type { AIProvider } from "../ai/ai-provider";
import type { TTSProvider } from "./tts-provider";

export class TTSAIProviderAdapter implements AIProvider {
  readonly providerType = AIProviderType.TTS;

  constructor(
    readonly providerName: string,
    readonly ttsProvider: TTSProvider
  ) {}
}
