import type { LLMProvider } from "./llm-provider";
import { MockLLMProvider } from "./mock-llm-provider";
import { OpenAILLMProvider } from "./openai-llm-provider";

export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || "mock";

  if (provider === "mock") {
    return new MockLLMProvider();
  }

  if (provider === "openai") {
    return new OpenAILLMProvider();
  }

  throw new Error(
    "Unknown LLM_PROVIDER: " +
      provider +
      ". Valid values are: mock, openai."
  );
}
