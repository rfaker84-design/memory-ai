import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEEPSEEK_API_BASE_URL,
  DeepSeekLLMProvider,
} from "./deepseek-llm-provider";

test("DeepSeek uses its fixed official endpoint and requires an explicit model", () => {
  assert.equal(DEEPSEEK_API_BASE_URL, "https://api.deepseek.com/v1");
  assert.throws(
    () => new DeepSeekLLMProvider({ DEEPSEEK_API_KEY: "key" }),
    /DEEPSEEK_MODEL_NOT_CONFIGURED/
  );
  assert.throws(
    () => new DeepSeekLLMProvider({ DEEPSEEK_MODEL: "deepseek-chat" }),
    /DEEPSEEK_API_KEY_NOT_CONFIGURED/
  );
});

test("the provider registry defers external SDK construction until DeepSeek is selected", () => {
  const source = readFileSync(new URL("../ai/global-ai-registry.ts", import.meta.url), "utf8");
  assert.match(source, /deepseek:\s*\(\)\s*=>\s*new LLMAIProviderAdapter/);
  assert.doesNotMatch(source, /new DeepSeekLLMProvider\(\)\s*\)\s*;/);
  assert.doesNotMatch(source, /new OpenAILLMProvider/);
});
