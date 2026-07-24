import { AIProviderRegistry } from "./ai-provider-factory";
import { LLMAIProviderAdapter } from "../llm/llm-ai-provider-adapter";
import { MockLLMProvider } from "../llm/mock-llm-provider";
import { DeepSeekLLMProvider } from "../llm/deepseek-llm-provider";
import { TTSAIProviderAdapter } from "../tts/tts-ai-provider-adapter";
import { MockTTSProvider } from "../tts/mock-tts-provider";
import { TencentTTSProvider } from "../tts/tencent-tts-provider";
import { AvatarAIProviderAdapter } from "../avatar/avatar-ai-provider-adapter";
import { MockAvatarProvider } from "../avatar/mock-avatar-provider";
import { EmbeddingAIProviderAdapter } from "../embedding/embedding-ai-provider-adapter";
import { MockEmbeddingProvider } from "../embedding/mock-embedding-provider";
import { VisionAIProviderAdapter } from "../vision/vision-ai-provider-adapter";
import { MockVisionProvider } from "../vision/mock-vision-provider";
import { OCRAIProviderAdapter } from "../ocr/ocr-ai-provider-adapter";
import { MockOCRProvider } from "../ocr/mock-ocr-provider";

let registryInstance: AIProviderRegistry | null = null;
const llmAdapters = new Map<string, LLMAIProviderAdapter>();

const llmAdapterFactories: Record<string, () => LLMAIProviderAdapter> = {
  mock: () => new LLMAIProviderAdapter("mock", new MockLLMProvider()),
  deepseek: () => new LLMAIProviderAdapter("deepseek", new DeepSeekLLMProvider()),
};

/**
 * LLM SDK clients are constructed only after their named provider was
 * selected. Isolated mock tests therefore never instantiate external SDKs.
 */
export function getLLMAIProviderAdapter(name: string): LLMAIProviderAdapter | undefined {
  const existing = llmAdapters.get(name);
  if (existing) return existing;

  const factory = llmAdapterFactories[name];
  if (!factory) return undefined;

  const adapter = factory();
  llmAdapters.set(name, adapter);
  return adapter;
}

export function getAIProviderRegistry(): AIProviderRegistry {
  if (!registryInstance) {
    registryInstance = new AIProviderRegistry();

    registryInstance.register(
      new TTSAIProviderAdapter("mock", new MockTTSProvider())
    );
    registryInstance.register(
      new TTSAIProviderAdapter("tencent", new TencentTTSProvider())
    );
    registryInstance.register(
      new AvatarAIProviderAdapter("mock", new MockAvatarProvider())
    );
    registryInstance.register(
      new EmbeddingAIProviderAdapter("mock", new MockEmbeddingProvider())
    );
    registryInstance.register(
      new VisionAIProviderAdapter("mock", new MockVisionProvider())
    );
    registryInstance.register(
      new OCRAIProviderAdapter("mock", new MockOCRProvider())
    );
  }

  return registryInstance;
}
