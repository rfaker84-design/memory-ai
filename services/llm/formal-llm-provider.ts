import { getAIProviderRegistry } from "../ai/global-ai-registry";
import { AIProviderType } from "../ai/provider-types";
import type { LLMAIProviderAdapter } from "./llm-ai-provider-adapter";
import type { LLMProvider } from "./llm-provider";

export class FormalLLMConfigurationError extends Error {}

/**
 * The formal memory experience never substitutes a canned reply in production.
 * Development and isolated tests may still select the mock adapter explicitly.
 */
export function resolveFormalLLMProvider(
  environment: NodeJS.ProcessEnv = process.env
): LLMProvider {
  const name = environment.LLM_PROVIDER?.trim() || "mock";

  if (environment.NODE_ENV === "production") {
    if (name !== "openai") {
      throw new FormalLLMConfigurationError("LLM_PROVIDER_NOT_CONFIGURED");
    }
    if (!(environment.DEEPSEEK_API_KEY?.trim() || environment.OPENAI_API_KEY?.trim())) {
      throw new FormalLLMConfigurationError("LLM_PROVIDER_CREDENTIALS_NOT_CONFIGURED");
    }
  }

  const adapter = getAIProviderRegistry().get<LLMAIProviderAdapter>(
    AIProviderType.LLM,
    name
  );
  if (!adapter) {
    throw new FormalLLMConfigurationError("LLM_PROVIDER_UNAVAILABLE");
  }
  return adapter.llmProvider;
}
