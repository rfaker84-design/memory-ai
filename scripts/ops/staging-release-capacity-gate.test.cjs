const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  GIB,
  MINIMUM_POSTFLIGHT_BYTES,
  MINIMUM_PREFLIGHT_BYTES,
  RETENTION_BUFFER_BYTES,
  requiredFreeBytes,
  writeReleaseCapacityMetadata,
} = require("./staging-release-capacity-gate.cjs");

test("candidate capacity requirement keeps an 8 GiB floor", () => {
  assert.equal(requiredFreeBytes(1), MINIMUM_PREFLIGHT_BYTES);
  assert.equal(MINIMUM_PREFLIGHT_BYTES, 8 * GIB);
  assert.equal(MINIMUM_POSTFLIGHT_BYTES, 5 * GIB);
});

test("candidate capacity requirement reserves two unpacked copies plus 5 GiB", () => {
  const unpacked = 3 * GIB;
  assert.equal(requiredFreeBytes(unpacked), (2 * unpacked) + RETENTION_BUFFER_BYTES);
  assert.throws(() => requiredFreeBytes(0), /CANDIDATE_UNPACKED_SIZE_INVALID/);
});

test("web and worker package payloads receive deterministic sizing metadata", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "memoryai-capacity-gate-"));
  try {
    mkdirSync(path.join(directory, "runtime"));
    writeFileSync(path.join(directory, "runtime", "server.js"), "server\n");
    const result = writeReleaseCapacityMetadata({ outputDirectory: directory, component: "web" });
    assert.equal(result.component, "web");
    assert.ok(result.candidateUnpackedBytes > 0);
    assert.ok(result.requiredFreeBytes >= 8 * GIB);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
