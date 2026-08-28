"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "../..");
const workflow = readFileSync(path.join(root, ".github/workflows/staging-web-immutable-artifact.yml"), "utf8");
const dockerfile = readFileSync(path.join(__dirname, "Dockerfile.staging-web-artifact"), "utf8");
const generator = readFileSync(path.join(__dirname, "generate-staging-web-artifact-evidence.cjs"), "utf8");

test("immutable Staging Web artifact workflow checks out an exact source commit and only uploads an artifact", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /source_commit:\s*[\s\S]*?required: true/);
  assert.match(workflow, /ref: \$\{\{ inputs\.source_commit \}\}\s*[\s\S]*?path: source/);
  assert.match(workflow, /test "\$\{\{ inputs\.source_commit \}\}" = "\$\(git -C source rev-parse HEAD\)"/);
  assert.match(workflow, /rm -rf source\/.git/);
  assert.match(workflow, /docker buildx build --pull=false/);
  assert.match(workflow, /--build-arg "STAGING_WEB_ARTIFACT_RUNNER_COMMIT=\$RUNNER_COMMIT"/);
  assert.match(workflow, /--target export/);
  assert.match(workflow, /actions\/upload-artifact@65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08/);
  assert.doesNotMatch(workflow, /\b(?:ssh|pm2|nginx|kubectl|helm|promotion|deploy)\b/i);
});

test("BuildKit recipe locks Linux Node/npm, bakes the feature flag, and exports no source tree", () => {
  assert.match(dockerfile, /FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293/);
  assert.match(dockerfile, /node --version\)" = "v20\.20\.2"/);
  assert.match(dockerfile, /npm --version\)" = "10\.8\.2"/);
  assert.match(dockerfile, /npm run test:qwen-voice-clone-beta && npm run build && npm run package:standalone-rc/);
  assert.match(dockerfile, /tar --dereference -C \/bundle -czf/);
  assert.match(dockerfile, /find \. -type f ! -name SHA256SUMS/);
  assert.match(dockerfile, /sha256sum -c SHA256SUMS/);
  assert.doesNotMatch(dockerfile, /COPY --from=builder \/app(\s|$)/);
});

test("evidence generator fails closed unless its client feature flag was baked by Linux BuildKit", () => {
  assert.match(generator, /process\.platform !== "linux"/);
  assert.match(generator, /Qwen-Audio-3\.0-TTS-Flash/);
  assert.match(generator, /STAGING_WEB_ARTIFACT_QWEN_VOICE_CLONE_CLIENT_CHUNK_MISSING/);
  assert.match(generator, /compiledClientChunks/);
  assert.match(generator, /runnerSourceCommit/);
  assert.match(generator, /STAGING_WEB_ARTIFACT_SYMLINK_FORBIDDEN/);
});
