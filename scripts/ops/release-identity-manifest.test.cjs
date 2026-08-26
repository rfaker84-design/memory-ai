const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { readReleaseIdentityManifest, writeReleaseIdentityManifest } = require("./release-identity-manifest.cjs");

test("release identity manifest binds a packaged release to the exact source commit", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "memoryai-release-manifest-"));
  try {
    const sourceRoot = path.join(directory, "source");
    execFileSync("git", ["init", sourceRoot]);
    execFileSync("git", ["-C", sourceRoot, "config", "user.email", "test@example.invalid"]);
    execFileSync("git", ["-C", sourceRoot, "config", "user.name", "Release test"]);
    writeFileSync(path.join(sourceRoot, "release-input.txt"), "immutable\n");
    execFileSync("git", ["-C", sourceRoot, "add", "release-input.txt"]);
    execFileSync("git", ["-C", sourceRoot, "commit", "-m", "release fixture"]);
    const result = writeReleaseIdentityManifest({ outputDirectory: directory, sourceRoot, component: "web" });
    const read = readReleaseIdentityManifest(result.destination);
    assert.equal(read.sourceSha, result.sourceSha);
    assert.equal(read.component, "web");
    assert.equal(read.immutable, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
