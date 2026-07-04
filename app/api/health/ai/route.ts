import { getAIProviderRegistry } from "../../../../services/ai/global-ai-registry";
import { AIProviderType } from "../../../../services/ai/provider-types";
import type { LLMAIProviderAdapter } from "../../../../services/llm/llm-ai-provider-adapter";
import type { TTSAIProviderAdapter } from "../../../../services/tts/tts-ai-provider-adapter";

const LEGACY_PROVIDER_FIELD = process.env.LLM_PROVIDER || "mock";

function hasProvider(type: AIProviderType, name: string): boolean {
  return Boolean(getAIProviderRegistry().get(type, name));
}

export async function GET() {
  const llmProvider = process.env.LLM_PROVIDER || "mock";
  const ttsProvider = process.env.TTS_PROVIDER || "mock";

  try {
    const llmAdapter = getAIProviderRegistry().get<LLMAIProviderAdapter>(
      AIProviderType.LLM,
      llmProvider
    );
    const ttsAdapter = getAIProviderRegistry().get<TTSAIProviderAdapter>(
      AIProviderType.TTS,
      ttsProvider
    );

    const llmReady = Boolean(llmAdapter);
    const ttsReady = Boolean(ttsAdapter);
    const ok = llmReady && ttsReady;

    return Response.json(
      {
        status: ok ? "ok" : "error",
        provider: LEGACY_PROVIDER_FIELD,
        hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
        llmProvider,
        ttsProvider,
        llmReady,
        ttsReady,
        registeredLLMProviders: getAIProviderRegistry()
          .list(AIProviderType.LLM)
          .map((p) => p.providerName),
        registeredTTSProviders: getAIProviderRegistry()
          .list(AIProviderType.TTS)
          .map((p) => p.providerName),
        hasTencentTTSProvider: hasProvider(AIProviderType.TTS, "tencent"),
      },
      { status: ok ? 200 : 500 }
    );
  } catch (error) {
    return Response.json(
      {
        status: "error",
        provider: LEGACY_PROVIDER_FIELD,
        hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
        llmProvider,
        ttsProvider,
        llmReady: false,
        ttsReady: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown AI health check error",
      },
      { status: 500 }
    );
  }
}
