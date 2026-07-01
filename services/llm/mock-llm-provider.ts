import type { LLMProvider } from "./llm-provider";
import type { LLMGenerateInput, LLMGenerateResult } from "./types";

export class MockLLMProvider implements LLMProvider {
  async generate(_input: LLMGenerateInput): Promise<LLMGenerateResult> {
    return {
      content: "我在这里，慢慢和你说。",
      finishReason: "stop",
    };
  }
}
