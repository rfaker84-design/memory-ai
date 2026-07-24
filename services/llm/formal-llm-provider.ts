import { getLLMAIProviderAdapter } from "../ai/global-ai-registry";
import type { LLMProvider } from "./llm-provider";

export class FormalLLMConfigurationError extends Error {}

export function getConfiguredLLMProviderName(
  environment: NodeJS.ProcessEnv = process.env
): string {
  return environment.LLM_PROVIDER?.trim() || "mock";
}

/**
 * The formal memory experience never substitutes a canned reply in production.
 * Development and isolated tests may still select the mock adapter explicitly.
 */
export function resolveFormalLLMProvider(
  environment: NodeJS.ProcessEnv = process.env
): LLMProvider {
  const name = getConfiguredLLMProviderName(environment);

  if (environment.NODE_ENV === "production") {
    if (name !== "deepseek") {
      throw new FormalLLMConfigurationError("DEEPSEEK_PROVIDER_REQUIRED");
    }
    if (!environment.DEEPSEEK_API_KEY?.trim()) {
      throw new FormalLLMConfigurationError("DEEPSEEK_API_KEY_NOT_CONFIGURED");
    }
    if (!environment.DEEPSEEK_MODEL?.trim()) {
      throw new FormalLLMConfigurationError("DEEPSEEK_MODEL_NOT_CONFIGURED");
    }
  }

  const adapter = getLLMAIProviderAdapter(name);
  if (!adapter) {
    throw new FormalLLMConfigurationError("LLM_PROVIDER_UNAVAILABLE");
  }
  return adapter.llmProvider;
}
