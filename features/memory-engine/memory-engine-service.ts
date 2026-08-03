import { MemoryContextBuilder } from "./context-builder";
import { PromptBuilder } from "./prompt-builder";
import { ResponsePipeline } from "./response-pipeline";
import type { MemoryEngineInput, MemoryEngineResponse } from "./types";
import type { LLMProvider } from "../../services/llm/llm-provider";
import { resolveFormalLLMProvider } from "../../services/llm/formal-llm-provider";

function resolveLLMProvider(): LLMProvider {
  return resolveFormalLLMProvider();
}

export class MemoryEngineService {
  private contextBuilder = new MemoryContextBuilder();
  private promptBuilder = new PromptBuilder();
  private responsePipeline = new ResponsePipeline();
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider ?? resolveLLMProvider();
  }

  async generateReply(input: MemoryEngineInput): Promise<MemoryEngineResponse> {
    const context = await this.contextBuilder.buildContext(input);
    const prompt = this.promptBuilder.buildPrompt(context);

    const result = await this.llmProvider.generate({
      messages: prompt.messages,
    });

    return {
      content: this.responsePipeline.processResponse({
        content: result.content,
        memoryName: context.memoryName,
        relationship: context.relationship,
      }),
    };
  }
}
