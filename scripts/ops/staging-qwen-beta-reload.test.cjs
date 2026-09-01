"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const { FLAG_KEY, safeRuntimeEnvironment } = require("./staging-qwen-beta-reload.cjs");

const current = { path: "/home/ubuntu/memoryai-staging/releases/0123456789abcdef0123456789abcdef01234567" };
const record = {
  pm2_env: {
    env: {
      DEPLOYMENT_ENV: "staging",
      MEMORYAI_DEPLOYMENT_TIER: "internal-beta",
      MEMORYAI_BETA_DATA_SCOPE: "isolated-test",
      MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_TEST_USER_IDS: "stg-qwen-vc-beta-0123456789abcdef",
      DASHSCOPE_API_KEY: "must-not-survive",
      DASHSCOPE_VOICE_CLONE_ENDPOINT: "https://must-not-survive.example.test",
    },
  },
};

test("beta reload preserves the isolated allowlist but never passes DashScope credentials to PM2", () => {
  const environment = safeRuntimeEnvironment(current, record, true);
  assert.equal(environment[FLAG_KEY], "true");
  assert.equal(environment.DASHSCOPE_API_KEY, undefined);
  assert.equal(environment.DASHSCOPE_VOICE_CLONE_ENDPOINT, undefined);
  assert.equal(environment.MEMORYAI_RELEASE_ROOT, path.join(current.path, "runtime"));
});

test("beta reload fails closed for a non-synthetic allowlist", () => {
  const invalid = structuredClone(record);
  invalid.pm2_env.env.MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_TEST_USER_IDS = "someone-else";
  assert.throws(() => safeRuntimeEnvironment(current, invalid, false), { code: "STAGING_QWEN_BETA_ALLOWLIST_INVALID" });
});
