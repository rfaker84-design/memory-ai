"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const { parseTokenConfig, resolveMediaPath, STAGING_ROOT } = require("./staging-qwen-synthetic-cleanup.cjs");

test("the synthetic cleanup token must be exact and self-verifying", () => {
  const token = "a".repeat(64);
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  assert.deepEqual(parseTokenConfig(
    `STAGING_QWEN_SYNTHETIC_CLEANUP_TOKEN=${token}\nSTAGING_QWEN_SYNTHETIC_CLEANUP_TOKEN_SHA256=${hash}\n`,
  ), { token, tokenHash: hash });
  assert.throws(() => parseTokenConfig(`STAGING_QWEN_SYNTHETIC_CLEANUP_TOKEN=${token}\nSTAGING_QWEN_SYNTHETIC_CLEANUP_TOKEN_SHA256=${"b".repeat(64)}\n`), {
    code: "QWEN_CLEANUP_TOKEN_INVALID",
  });
});

test("the synthetic cleanup cannot resolve media outside its Staging root", () => {
  const root = `${STAGING_ROOT}/media`;
  assert.equal(resolveMediaPath(root, "media/user/audio.wav"), `${root}/media/user/audio.wav`);
  assert.throws(() => resolveMediaPath(root, "media/../outside.wav"), { code: "QWEN_CLEANUP_MEDIA_KEY_INVALID" });
  assert.throws(() => resolveMediaPath("/tmp/staging-media", "media/audio.wav"), { code: "QWEN_CLEANUP_MEDIA_ROOT_INVALID" });
});
