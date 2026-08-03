const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const source = readFileSync(join(__dirname, "..", "check-production.sh"), "utf8");

test("legacy production preflight cannot issue direct probes without immutable-artifact evidence and Owner approval", () => {
  assert.match(source, /set -euo pipefail/);
  assert.match(source, /LEGACY_PRODUCTION_PREFLIGHT_RETIRED/);
  assert.match(source, /R-01 evidence, explicit Owner preflight authorization, and a declared target/);
  assert.match(source, /exit 64/);
  assert.doesNotMatch(source, /curl\s+-I\s+https:\/\/yijianmemory\.cn/);
  assert.doesNotMatch(source, /\bpm2 status\b/);
  assert.doesNotMatch(source, /\bnginx -t\b/);
});
