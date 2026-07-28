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
    () => resolveFormalLLMProvider({ NODE_ENV: "production", LLM_PROVIDER: "unrecognised-provider" }),
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

test("production-built staging accepts only the isolated mock LLM contract", () => {
  const provider = resolveFormalLLMProvider({
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "staging",
    DATABASE_URL: "postgresql://staging:secret@127.0.0.1:5432/memoryai_staging",
    STAGING_DATABASE_ISOLATION: "isolated",
    STAGING_DATABASE_NAME: "memoryai_staging",
    STAGING_DATA_SOURCE: "empty",
    AUTH_ALLOWED_ORIGIN: "https://app.staging.yijianmemory.cn",
    STAGING_ACCESS_TOKEN: "a".repeat(48),
    STAGING_FIXED_SMS_CODE: "246810",
    STAGING_FIXED_SMS_PHONES: "+8613800013800,+8613900013900",
    STAGING_MEDIA_ROOT: "/var/lib/memoryai-staging/media",
    STAGING_MEDIA_SIGNING_SECRET: "m".repeat(32),
    LLM_PROVIDER: "mock",
    TTS_PROVIDER: "mock",
  });
  assert.ok(provider);
});
