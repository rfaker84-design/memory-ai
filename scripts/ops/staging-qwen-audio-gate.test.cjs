"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { canonicalFixture, classifyNonWav, parseRiffWav, validateCanonicalWav } = require("./staging-qwen-audio-gate.cjs");

function withChunk(audio, id, body) {
  const chunk = Buffer.alloc(8 + body.length + (body.length % 2));
  chunk.write(id, 0); chunk.writeUInt32LE(body.length, 4); body.copy(chunk, 8);
  const dataOffset = audio.indexOf(Buffer.from("data"));
  const output = Buffer.concat([audio.subarray(0, dataOffset), chunk, audio.subarray(dataOffset)]);
  output.writeUInt32LE(output.length - 8, 4);
  return output;
}

function pcmWav({ channels = 1, sampleRate = 24_000, bitsPerSample = 16, milliseconds = 12_000 } = {}) {
  const bytesPerSample = bitsPerSample / 8;
  const dataBytes = Math.round(milliseconds / 1000 * sampleRate * channels * bytesPerSample);
  const output = Buffer.alloc(44 + dataBytes);
  output.write("RIFF", 0); output.writeUInt32LE(output.length - 8, 4); output.write("WAVE", 8);
  output.write("fmt ", 12); output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(channels, 22);
  output.writeUInt32LE(sampleRate, 24); output.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  output.writeUInt16LE(channels * bytesPerSample, 32); output.writeUInt16LE(bitsPerSample, 34);
  output.write("data", 36); output.writeUInt32LE(dataBytes, 40);
  return output;
}

function withExtendedFmt(audio) {
  const format = Buffer.alloc(18);
  audio.copy(format, 0, 20, 36);
  format.writeUInt16LE(0, 16);
  const header = Buffer.alloc(8 + format.length);
  header.write("fmt ", 0); header.writeUInt32LE(format.length, 4); format.copy(header, 8);
  const output = Buffer.concat([audio.subarray(0, 12), header, audio.subarray(36)]);
  output.writeUInt32LE(output.length - 8, 4);
  return output;
}

test("canonical PCM16 mono WAV passes the Qwen hard gate", () => {
  const result = validateCanonicalWav(canonicalFixture());
  assert.equal(result.durationMilliseconds, 12_000);
  assert.equal(result.sampleRate, 24_000);
});

test("legal LIST and JUNK chunks are traversed instead of assumed at fixed offsets", () => {
  const result = validateCanonicalWav(withChunk(withChunk(canonicalFixture(), "JUNK", Buffer.from([1, 2, 3])), "LIST", Buffer.from("INFO")));
  assert.deepEqual(result.chunks.map((chunk) => chunk.id), ["fmt ", "JUNK", "LIST", "data"]);
});

test("a legal extended fmt chunk remains valid after RIFF traversal", () => {
  const result = validateCanonicalWav(withExtendedFmt(canonicalFixture()));
  assert.equal(result.size, 18);
  assert.equal(result.bitsPerSample, 16);
});

test("HTML, raw PCM, empty, and truncated bytes are rejected", () => {
  for (const body of [Buffer.from("<!doctype html><html>error</html>"), Buffer.alloc(4096, 1), Buffer.alloc(0), canonicalFixture().subarray(0, 40)]) {
    assert.throws(() => validateCanonicalWav(body));
  }
  assert.equal(classifyNonWav(Buffer.from("<!doctype html>")), "html_or_xml");
  assert.equal(classifyNonWav(Buffer.alloc(4096, 1)), "raw_pcm_or_unknown_binary");
});

test("stereo, low-rate, and wrong-bit-depth WAV inputs are never accepted without normalization", () => {
  for (const body of [pcmWav({ channels: 2 }), pcmWav({ sampleRate: 8_000 }), pcmWav({ bitsPerSample: 24 })]) {
    assert.doesNotThrow(() => parseRiffWav(body));
    assert.throws(() => validateCanonicalWav(body));
  }
});
