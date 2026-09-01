"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const ingest = path.join(__dirname, "staging-qwen-secret-ingest.cjs");
const payload = JSON.stringify({
  apiKey: "sk-ws-fictional.alpha_beta-123",
  endpoint: "https://workspace-1.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization",
});

test("validate-only exercises the strict wrapper without creating a Staging secret", () => {
  const result = spawnSync(process.execPath, [ingest, "--validate-only"], { input: payload, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "STAGING_QWEN_SECRET_VALIDATED");
  assert.equal(result.stderr, "");
});

test("validate-only rejects unrecognized command arguments", () => {
  const result = spawnSync(process.execPath, [ingest, "--not-a-mode"], { input: payload, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /code=STAGING_QWEN_SECRET_ARGUMENTS_INVALID/);
  assert.equal(result.stdout, "");
});
