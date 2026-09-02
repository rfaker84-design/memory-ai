"use strict";

const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { classifyNonWav, parseRiffWav, redactedPrefixEvidence, validateCanonicalWav } = require("./staging-qwen-audio-gate.cjs");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function sanitize(value) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s"']+/giu, "[REDACTED_URL]")
    .replace(/\bsk-[A-Za-z0-9._-]+/gu, "[REDACTED_KEY]")
    .replace(/(?:signature|authorization)\s*[:=]\s*\S+/giu, "[REDACTED_HEADER]");
}

function command(file, args) {
  try {
    return { exitCode: 0, stdout: sanitize(execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })), stderr: "" };
  } catch (error) {
    return {
      exitCode: Number.isInteger(error?.status) ? error.status : 1,
      stdout: sanitize(error?.stdout),
      stderr: sanitize(error?.stderr),
    };
  }
}

function inspectFile(file) {
  return {
    file: command("file", ["-b", file]),
    ffprobe: command("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file]),
    ffmpegDecode: command("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"]),
  };
}

function reportPath(directory, label) {
  if (typeof label !== "string" || !/^[a-z0-9-]{1,64}$/u.test(label)) fail("STAGING_QWEN_AUDIO_EVIDENCE_LABEL_INVALID");
  const root = path.resolve(directory);
  const target = path.resolve(root, `qwen-audio-${label}.json`);
  if (!target.startsWith(`${root}${path.sep}`)) fail("STAGING_QWEN_AUDIO_EVIDENCE_PATH_INVALID");
  return target;
}

function writeEvidence(directory, label, value) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = reportPath(directory, label);
  if (existsSync(target)) fail("STAGING_QWEN_AUDIO_EVIDENCE_COLLISION");
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

function facts(audio) {
  return {
    bytes: Buffer.isBuffer(audio) ? audio.length : 0,
    sha256: Buffer.isBuffer(audio) ? crypto.createHash("sha256").update(audio).digest("hex") : null,
    first64: redactedPrefixEvidence(audio),
  };
}

function inspectWav(audio) {
  try {
    return { validRiffWave: true, parsed: parseRiffWav(audio) };
  } catch (error) {
    return { validRiffWave: false, code: error?.code ?? "STAGING_QWEN_AUDIO_INSPECTION_FAILED", classification: classifyNonWav(audio) };
  }
}

function normalize(raw, output) {
  return command("ffmpeg", ["-y", "-i", raw, "-map_metadata", "-1", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", output]);
}

function auditAndNormalizeWav(audio, options) {
  const { evidenceDirectory, label } = options ?? {};
  if (!Buffer.isBuffer(audio) || !evidenceDirectory || !label) fail("STAGING_QWEN_AUDIO_EVIDENCE_INPUT_INVALID");
  const temporary = mkdtempSync(path.join(os.tmpdir(), "memoryai-qwen-audio-"));
  const raw = path.join(temporary, "download.bin");
  const normalized = path.join(temporary, "normalized.wav");
  const report = { schemaVersion: 1, label, source: facts(audio), raw: null, normalized: null };
  try {
    writeFileSync(raw, audio, { mode: 0o600, flag: "wx" });
    report.raw = { inspection: inspectWav(audio), tools: inspectFile(raw) };
    if (!report.raw.inspection.validRiffWave) {
      writeEvidence(evidenceDirectory, label, report);
      fail("STAGING_QWEN_E2E_SOURCE_NOT_RIFF_WAV");
    }
    let output = audio;
    try {
      validateCanonicalWav(output);
      report.normalized = { applied: false, facts: facts(output), parsed: parseRiffWav(output), tools: report.raw.tools };
    } catch {
      const normalization = normalize(raw, normalized);
      report.normalized = { applied: true, normalization };
      if (normalization.exitCode !== 0 || !existsSync(normalized)) {
        writeEvidence(evidenceDirectory, label, report);
        fail("STAGING_QWEN_E2E_WAV_NORMALIZATION_FAILED");
      }
      output = readFileSync(normalized);
      report.normalized = { ...report.normalized, facts: facts(output), parsed: inspectWav(output), tools: inspectFile(normalized) };
      validateCanonicalWav(output);
    }
    const parsed = validateCanonicalWav(output);
    if (report.normalized?.tools?.ffmpegDecode?.exitCode !== 0) {
      writeEvidence(evidenceDirectory, label, report);
      fail("STAGING_QWEN_E2E_WAV_DECODE_FAILED");
    }
    writeEvidence(evidenceDirectory, label, report);
    return { audio: output, wav: parsed };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

module.exports = { auditAndNormalizeWav, inspectWav };
