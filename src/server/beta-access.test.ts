import assert from "node:assert/strict";
import test from "node:test";

import { resolveInternalBetaAccess } from "./beta-access";

const enabled = {
  MEMORYAI_DEPLOYMENT_TIER: "internal-beta",
  MEMORYAI_BETA_DATA_SCOPE: "isolated-test",
  MEMORYAI_LONG_TERM_MEMORY_BETA_ENABLED: "true",
  MEMORYAI_LONG_TERM_MEMORY_BETA_TEST_USER_IDS: "tester-a,tester-b",
};

test("internal beta access requires the deployment tier, isolated data, flag, and exact test account", () => {
  assert.deepEqual(resolveInternalBetaAccess("long-term-memory", "tester-a", enabled), {
    allowed: true,
    reason: "allowed",
  });
  assert.equal(
    resolveInternalBetaAccess("long-term-memory", "tester", enabled).allowed,
    false
  );
});

test("internal beta fails closed when any non-production boundary is absent", () => {
  for (const key of [
    "MEMORYAI_DEPLOYMENT_TIER",
    "MEMORYAI_BETA_DATA_SCOPE",
    "MEMORYAI_LONG_TERM_MEMORY_BETA_ENABLED",
    "MEMORYAI_LONG_TERM_MEMORY_BETA_TEST_USER_IDS",
  ] as const) {
    const environment = { ...enabled, [key]: undefined };
    assert.equal(
      resolveInternalBetaAccess("long-term-memory", "tester-a", environment).allowed,
      false,
      key
    );
  }
});

test("Qwen voice cloning has its own explicit flag and exact allowlist", () => {
  const qwenEnabled = {
    DEPLOYMENT_ENV: "staging",
    MEMORYAI_DEPLOYMENT_TIER: "internal-beta",
    MEMORYAI_BETA_DATA_SCOPE: "isolated-test",
    MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED: "true",
    MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_TEST_USER_IDS: "voice-tester",
  };
  assert.equal(
    resolveInternalBetaAccess("qwen-audio-tts-flash-voice-clone", "voice-tester", qwenEnabled).allowed,
    true
  );
  assert.equal(
    resolveInternalBetaAccess("qwen-audio-tts-flash-voice-clone", "tester-a", qwenEnabled).allowed,
    false
  );
  assert.equal(
    resolveInternalBetaAccess("qwen-audio-tts-flash-voice-clone", "voice-tester", {
      ...qwenEnabled,
      MEMORYAI_QWEN_AUDIO_TTS_FLASH_VOICE_CLONE_BETA_ENABLED: "false",
    }).allowed,
    false
  );
  assert.deepEqual(
    resolveInternalBetaAccess("qwen-audio-tts-flash-voice-clone", "voice-tester", {
      ...qwenEnabled,
      DEPLOYMENT_ENV: "production",
    }),
    { allowed: false, reason: "deployment_not_staging" }
  );
});
