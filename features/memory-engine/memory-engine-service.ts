import { MemoryContextBuilder } from "./context-builder";
import { PromptBuilder } from "./prompt-builder";
import type { MemoryEngineInput, MemoryEngineResponse } from "./types";
import type { LLMProvider } from "../../services/llm/llm-provider";
import { getAIProviderRegistry } from "../../services/ai/global-ai-registry";
import { AIProviderType } from "../../services/ai/provider-types";
import type { LLMAIProviderAdapter } from "../../services/llm/llm-ai-provider-adapter";

function resolveLLMProvider(): LLMProvider {
  const name = process.env.LLM_PROVIDER || "mock";
  const registry = getAIProviderRegistry();
  const adapter = registry.get<LLMAIProviderAdapter>(
    AIProviderType.LLM,
    name
  );

  if (!adapter) {
    throw new Error(
      "LLM provider not found in AI Registry: " + name
    );
  }

  return adapter.llmProvider;
}

export class MemoryEngineService {
  private contextBuilder = new MemoryContextBuilder();
  private promptBuilder = new PromptBuilder();
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider ?? resolveLLMProvider();
  }

  async generateReply(input: MemoryEngineInput): Promise<MemoryEngineResponse> {
    const context = await this.contextBuilder.buildContext(input);
    const prompt = this.promptBuilder.buildPrompt(context);

    // TODO: update summary via SummaryEngine

    const result = await this.llmProvider.generate({
      messages: prompt.messages,
    });

    return { content: result.content };
  }
}
