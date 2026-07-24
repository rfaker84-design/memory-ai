import OpenAI from "openai";

import type { LLMProvider } from "./llm-provider";
import type { LLMGenerateInput, LLMGenerateResult } from "./types";

export const DEEPSEEK_API_BASE_URL = "https://api.deepseek.com/v1";

type DeepSeekEnvironment = {
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
};

export class DeepSeekLLMProvider implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(environment: DeepSeekEnvironment = {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  }) {
    const apiKey = environment.DEEPSEEK_API_KEY?.trim();
    const model = environment.DEEPSEEK_MODEL?.trim();

    if (!apiKey) throw new Error("DEEPSEEK_API_KEY_NOT_CONFIGURED");
    if (!model) throw new Error("DEEPSEEK_MODEL_NOT_CONFIGURED");

    this.model = model;
    this.client = new OpenAI({ apiKey, baseURL: DEEPSEEK_API_BASE_URL });
    console.info("[llm-provider] initialized", {
      provider: "deepseek",
      endpoint: DEEPSEEK_API_BASE_URL,
      model,
    });
  }

  async generate(input: LLMGenerateInput): Promise<LLMGenerateResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: input.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 300,
      });

      const content = response.choices[0]?.message?.content?.trim() ?? "";
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
    } catch (error) {
      console.warn("[llm-provider] request failed", { provider: "deepseek" });
      throw error;
    }
  }
}
