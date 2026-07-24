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

test("DeepSeek sends chat requests only to its official endpoint", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedInit = init;
    return Response.json({
      id: "chatcmpl-deepseek-test",
      object: "chat.completion",
      created: 0,
      model: "deepseek-chat",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "DeepSeek response" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    });
  }) as typeof fetch;

  try {
    const provider = new DeepSeekLLMProvider({
      DEEPSEEK_API_KEY: "test-deepseek-key",
      DEEPSEEK_MODEL: "deepseek-chat",
    });
    const result = await provider.generate({
      messages: [{ role: "user", content: "Please reply from DeepSeek." }],
    });

    assert.equal(result.content, "DeepSeek response");
    assert.equal(requestedUrl, "https://api.deepseek.com/v1/chat/completions");
    assert.doesNotMatch(requestedUrl, /api\.openai\.com/);
    assert.equal(new Headers(requestedInit?.headers).get("authorization"), "Bearer test-deepseek-key");
    assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
      model: "deepseek-chat",
      messages: [{ role: "user", content: "Please reply from DeepSeek." }],
      temperature: 0.7,
      max_tokens: 300,
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});
