import type { LLMProvider } from "./llm-provider";
import { DeepSeekLLMProvider } from "./deepseek-llm-provider";
import { resolveFormalLLMProvider } from "./formal-llm-provider";
import { MockLLMProvider } from "./mock-llm-provider";
import { OpenAILLMProvider } from "./openai-llm-provider";

export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || "mock";

  if (process.env.NODE_ENV === "production") {
    return resolveFormalLLMProvider();
  }

  if (provider === "mock") {
    return new MockLLMProvider();
  }

  if (provider === "openai") {
    return new OpenAILLMProvider();
  }

  if (provider === "deepseek") {
    return new DeepSeekLLMProvider();
  }

  throw new Error(
    "Unknown LLM_PROVIDER: " +
      provider +
      ". Valid values are: mock, deepseek, openai."
  );
}
