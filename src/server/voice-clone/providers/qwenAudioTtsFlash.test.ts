import assert from "node:assert/strict";
import test from "node:test";

import { qwenAudioTtsFlashProvider } from "./qwenAudioTtsFlash";

test("Qwen Audio Flash uses the documented voice-enrollment request and never returns the sample URL", async () => {
  const originalFetch = globalThis.fetch;
  const originalEndpoint = process.env.DASHSCOPE_VOICE_CLONE_ENDPOINT;
  const originalKey = process.env.DASHSCOPE_API_KEY;
  let request: Request | undefined;
  process.env.DASHSCOPE_VOICE_CLONE_ENDPOINT = "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization";
  process.env.DASHSCOPE_API_KEY = "test-key";
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return Response.json({ output: { voice_id: "qwen-audio-3.0-tts-flash-ma12345678-voice" }, request_id: "request-1" });
  };
  try {
    const result = await qwenAudioTtsFlashProvider.createJob({
      jobId: "12345678-1234-4123-8123-123456789012",
      memoryId: "11111111-1111-4111-8111-111111111111",
      voiceSampleUrl: "https://staging.example.test/api/media/local?signature=secret",
      voicePrefix: "ma12345678",
    });
    assert.equal(request?.url, process.env.DASHSCOPE_VOICE_CLONE_ENDPOINT);
    assert.equal(request?.headers.get("authorization"), "Bearer test-key");
    assert.deepEqual(await request?.json(), {
      model: "voice-enrollment",
      input: {
        action: "create_voice",
        target_model: "qwen-audio-3.0-tts-flash",
        prefix: "ma12345678",
        url: "https://staging.example.test/api/media/local?signature=secret",
      },
    });
    assert.equal(result.voiceId, "qwen-audio-3.0-tts-flash-ma12345678-voice");
    assert.equal(JSON.stringify(result.providerRequest).includes("signature=secret"), false);
    assert.equal(JSON.stringify(result.providerResponse).includes("signature=secret"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEndpoint === undefined) delete process.env.DASHSCOPE_VOICE_CLONE_ENDPOINT;
    else process.env.DASHSCOPE_VOICE_CLONE_ENDPOINT = originalEndpoint;
    if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY;
    else process.env.DASHSCOPE_API_KEY = originalKey;
  }
});

test("Qwen Audio Flash fails closed without the isolated endpoint and API key", async () => {
  const originalEndpoint = process.env.DASHSCOPE_VOICE_CLONE_ENDPOINT;
  const originalKey = process.env.DASHSCOPE_API_KEY;
  delete process.env.DASHSCOPE_VOICE_CLONE_ENDPOINT;
  delete process.env.DASHSCOPE_API_KEY;
  try {
    await assert.rejects(
      qwenAudioTtsFlashProvider.createJob({
        jobId: "12345678-1234-4123-8123-123456789012",
        memoryId: "11111111-1111-4111-8111-111111111111",
        voiceSampleUrl: "https://staging.example.test/sample.wav",
        voicePrefix: "ma12345678",
      }),
      { message: "QWEN_VOICE_CLONE_NOT_CONFIGURED" },
    );
  } finally {
    if (originalEndpoint === undefined) delete process.env.DASHSCOPE_VOICE_CLONE_ENDPOINT;
    else process.env.DASHSCOPE_VOICE_CLONE_ENDPOINT = originalEndpoint;
    if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY;
    else process.env.DASHSCOPE_API_KEY = originalKey;
  }
});
