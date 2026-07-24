import OpenAI from "openai";
import type { LLMProvider } from "./llm-provider";
import type { LLMGenerateInput, LLMGenerateResult } from "./types";

export class OpenAILLMProvider implements LLMProvider {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY || "";
    const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async generate(input: LLMGenerateInput): Promise<LLMGenerateResult> {
    const model = process.env.OPENAI_MODEL || "gpt-5.5";

    const response = await this.client.chat.completions.create({
      model,
      messages: input.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 300,
    });

    const content =
      response.choices[0]?.message?.content?.trim() ?? "";

    return {
      content,
      finishReason: response.choices[0]?.finish_reason ?? undefined,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}
