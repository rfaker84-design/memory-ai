"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { canonicalEndpoint, parseSecretText, serializedSecretFile } = require("./staging-web-secret-runtime-wrapper.cjs");

const endpoint = "https://workspace-1.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization";
const apiKey = "k".repeat(32);

test("Qwen secret file accepts only the canonical Beijing customization endpoint", () => {
  assert.equal(canonicalEndpoint(endpoint), endpoint);
  assert.throws(() => canonicalEndpoint("https://workspace-1.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer"), { code: "STAGING_QWEN_SECRET_ENDPOINT_INVALID" });
  assert.throws(() => canonicalEndpoint("https://workspace-1.ap-southeast-1.maas.aliyuncs.com/api/v1/services/audio/tts/customization"), { code: "STAGING_QWEN_SECRET_ENDPOINT_INVALID" });
});

test("the secret serializer is strict and never accepts extra fields", () => {
  const value = serializedSecretFile({ apiKey, endpoint });
  assert.deepEqual(parseSecretText(value), { DASHSCOPE_API_KEY: apiKey, DASHSCOPE_VOICE_CLONE_ENDPOINT: endpoint });
  assert.throws(() => parseSecretText(`${value}EXTRA=value\n`), { code: "STAGING_QWEN_SECRET_FILE_INVALID" });
  assert.throws(() => serializedSecretFile({ apiKey: "too-short", endpoint }), { code: "STAGING_QWEN_SECRET_KEY_INVALID" });
});
