import assert from "node:assert/strict";
import test from "node:test";

import {
  FormalLLMConfigurationError,
  resolveFormalLLMProvider,
} from "./formal-llm-provider";

test("formal production LLM resolution requires the explicit DeepSeek identity, key, and model", () => {
  assert.throws(
    () => resolveFormalLLMProvider({ NODE_ENV: "production", LLM_PROVIDER: "mock" }),
    (error: unknown) => error instanceof FormalLLMConfigurationError
      && error.message === "DEEPSEEK_PROVIDER_REQUIRED"
  );
  assert.throws(
    () => resolveFormalLLMProvider({ NODE_ENV: "production", LLM_PROVIDER: "openai" }),
    (error: unknown) => error instanceof FormalLLMConfigurationError
      && error.message === "DEEPSEEK_PROVIDER_REQUIRED"
  );
  assert.throws(
    () => resolveFormalLLMProvider({ NODE_ENV: "production", LLM_PROVIDER: "deepseek" }),
    (error: unknown) => error instanceof FormalLLMConfigurationError
      && error.message === "DEEPSEEK_API_KEY_NOT_CONFIGURED"
  );
  assert.throws(
    () => resolveFormalLLMProvider({
      NODE_ENV: "production",
      LLM_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "test-key",
    }),
    (error: unknown) => error instanceof FormalLLMConfigurationError
      && error.message === "DEEPSEEK_MODEL_NOT_CONFIGURED"
  );
});

test("explicit mock resolution does not require inactive OpenAI or DeepSeek credentials", () => {
  const provider = resolveFormalLLMProvider({ NODE_ENV: "test", LLM_PROVIDER: "mock" });
  assert.ok(provider);
});
