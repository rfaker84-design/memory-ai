"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { MODEL, parseWav, previewPath, ttsEndpoint } = require("./staging-qwen-real-e2e.cjs");
const { canonicalFixture } = require("./staging-qwen-audio-gate.cjs");

test("E2E uses the workspace-bound Qwen-Audio-TTS endpoint and validates canonical WAV duration", () => {
  assert.equal(ttsEndpoint("https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization"), "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer");
  assert.equal(MODEL, "qwen-audio-3.0-tts-flash");
  assert.equal(parseWav(canonicalFixture()).durationMilliseconds, 12000);
});

test("E2E rejects malformed preview IDs and impossible WAV samples", () => {
  assert.throws(() => previewPath("not-a-uuid"), { code: "STAGING_QWEN_E2E_RUN_ID_INVALID" });
  assert.throws(() => parseWav(Buffer.from("not-wav")), { code: "STAGING_QWEN_AUDIO_RIFF_WAVE_REQUIRED" });
});
