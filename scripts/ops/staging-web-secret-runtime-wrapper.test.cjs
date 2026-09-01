"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { canonicalEndpoint, parseSecretText, serializedSecretFile, shouldLoadQwenSecrets } = require("./staging-web-secret-runtime-wrapper.cjs");

const endpoint = "https://workspace-1.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization";
const apiKey = "sk-ws-fictional.alpha_beta-123";

test("Qwen secret file accepts only the canonical Beijing customization endpoint", () => {
  assert.equal(canonicalEndpoint(endpoint), endpoint);
  assert.throws(() => canonicalEndpoint("https://workspace-1.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer"), { code: "STAGING_QWEN_SECRET_ENDPOINT_INVALID" });
  assert.throws(() => canonicalEndpoint("https://workspace-1.ap-southeast-1.maas.aliyuncs.com/api/v1/services/audio/tts/customization"), { code: "STAGING_QWEN_SECRET_ENDPOINT_INVALID" });
});

test("the secret serializer is strict and never accepts extra fields", () => {
  const value = serializedSecretFile({ apiKey, endpoint });
  assert.deepEqual(parseSecretText(value), { DASHSCOPE_API_KEY: apiKey, DASHSCOPE_VOICE_CLONE_ENDPOINT: endpoint });
  assert.throws(() => parseSecretText(`${value}EXTRA=value\n`), { code: "STAGING_QWEN_SECRET_FILE_INVALID" });
  assert.equal(parseSecretText(serializedSecretFile({ apiKey, endpoint })).DASHSCOPE_API_KEY, apiKey);
  assert.throws(() => serializedSecretFile({ apiKey: "sk-ws-has whitespace", endpoint }), { code: "STAGING_QWEN_SECRET_KEY_INVALID" });
  assert.throws(() => serializedSecretFile({ apiKey: "sk-ws-has\nnewline", endpoint }), { code: "STAGING_QWEN_SECRET_KEY_INVALID" });
  assert.throws(() => serializedSecretFile({ apiKey: "sk-ws-control\u0000byte", endpoint }), { code: "STAGING_QWEN_SECRET_KEY_INVALID" });
  assert.throws(() => serializedSecretFile({ apiKey: "sk-not-workspace", endpoint }), { code: "STAGING_QWEN_SECRET_KEY_INVALID" });
  assert.throws(() => serializedSecretFile({ apiKey: `sk-ws-${"a".repeat(1025)}`, endpoint }), { code: "STAGING_QWEN_SECRET_KEY_INVALID" });
});

test("a beta-disabled immutable promotion never requires or loads Qwen secrets", () => {
  assert.equal(shouldLoadQwenSecrets("false"), false);
  assert.equal(shouldLoadQwenSecrets("true"), true);
  assert.throws(() => shouldLoadQwenSecrets(undefined), { code: "STAGING_WEB_SECRET_BETA_FLAG_INVALID" });
  assert.throws(() => shouldLoadQwenSecrets("FALSE"), { code: "STAGING_WEB_SECRET_BETA_FLAG_INVALID" });
});

test("the beta-disabled verifier accepts only the required external response", () => {
  const { isBetaDisabledResponse } = require("./staging-qwen-real-e2e.cjs");
  assert.equal(isBetaDisabledResponse({ status: 404 }, { error: "BETA_NOT_AVAILABLE" }), true);
  assert.equal(isBetaDisabledResponse({ status: 401 }, { error: "BETA_NOT_AVAILABLE" }), false);
  assert.equal(isBetaDisabledResponse({ status: 404 }, { error: "OTHER" }), false);
});
