"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { MODEL, parseWav, previewPath, ttsEndpoint } = require("./staging-qwen-real-e2e.cjs");

function wav(milliseconds = 3000) {
  const sampleRate = 8000;
  const byteRate = sampleRate * 2;
  const dataBytes = Math.ceil((milliseconds / 1000) * byteRate);
  const audio = Buffer.alloc(44 + dataBytes);
  audio.write("RIFF", 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write("WAVE", 8);
  audio.write("fmt ", 12); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(sampleRate, 24); audio.writeUInt32LE(byteRate, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write("data", 36); audio.writeUInt32LE(dataBytes, 40);
  return audio;
}

test("E2E uses the workspace-bound Qwen-Audio-TTS endpoint and validates WAV duration", () => {
  assert.equal(ttsEndpoint("https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization"), "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer");
  assert.equal(MODEL, "qwen-audio-3.0-tts-flash");
  assert.equal(parseWav(wav()).durationMilliseconds, 3000);
});

test("E2E rejects malformed preview IDs and impossible WAV samples", () => {
  assert.throws(() => previewPath("not-a-uuid"), { code: "STAGING_QWEN_E2E_RUN_ID_INVALID" });
  assert.throws(() => parseWav(Buffer.from("not-wav")), { code: "STAGING_QWEN_E2E_WAV_INVALID" });
});
