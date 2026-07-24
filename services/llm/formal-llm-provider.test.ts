import assert from "node:assert/strict";
import test from "node:test";

import {
  FormalLLMConfigurationError,
  resolveFormalLLMProvider,
} from "./formal-llm-provider";

test("formal production LLM resolution rejects mock and missing credentials", () => {
  assert.throws(
    () => resolveFormalLLMProvider({ NODE_ENV: "production", LLM_PROVIDER: "mock" }),
    (error: unknown) => error instanceof FormalLLMConfigurationError
      && error.message === "LLM_PROVIDER_NOT_CONFIGURED"
  );
  assert.throws(
    () => resolveFormalLLMProvider({ NODE_ENV: "production", LLM_PROVIDER: "openai" }),
    (error: unknown) => error instanceof FormalLLMConfigurationError
      && error.message === "LLM_PROVIDER_CREDENTIALS_NOT_CONFIGURED"
  );
});

test("development can use the explicit mock adapter for isolated tests", () => {
  const previous = process.env.OPENAI_API_KEY;
  try {
    process.env.OPENAI_API_KEY = "test-only-registry-key";
    const provider = resolveFormalLLMProvider({ NODE_ENV: "test", LLM_PROVIDER: "mock" });
    assert.ok(provider);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});
