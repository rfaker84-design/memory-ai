const { execFileSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const RELEASE_IDENTITY_MANIFEST = "release-manifest.json";
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function fail(code, detail) {
  throw new Error(`${code}${detail === undefined ? "" : `:${detail}`}`);
}

function sourceCommitSha(sourceRoot) {
  let status;
  try {
    status = execFileSync("git", ["-C", sourceRoot, "status", "--porcelain=v1"], { encoding: "utf8" }).trim();
  } catch (error) {
    fail("RELEASE_SOURCE_STATUS_UNAVAILABLE", error instanceof Error ? error.message : "git");
  }
  if (status) fail("RELEASE_SOURCE_WORKTREE_DIRTY");
  let sha;
  try {
    sha = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch (error) {
    fail("RELEASE_SOURCE_COMMIT_UNAVAILABLE", error instanceof Error ? error.message : "git");
  }
  if (!SHA_PATTERN.test(sha)) fail("RELEASE_SOURCE_COMMIT_INVALID", sha);
  return sha.toLowerCase();
}

function writeReleaseIdentityManifest({ outputDirectory, sourceRoot, component }) {
  if (component !== "web" && component !== "worker") fail("RELEASE_MANIFEST_COMPONENT_INVALID", component);
  const destination = path.join(outputDirectory, RELEASE_IDENTITY_MANIFEST);
  const payload = {
    version: 1,
    immutable: true,
    rebuildable: true,
    persistentData: false,
    noEnvironmentFiles: true,
    sourceSha: sourceCommitSha(sourceRoot),
    component,
  };
  writeFileSync(destination, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o644 });
  return { destination, ...payload };
}

function readReleaseIdentityManifest(file) {
  const payload = JSON.parse(readFileSync(file, "utf8"));
  if (
    payload?.version !== 1
    || payload?.immutable !== true
    || payload?.rebuildable !== true
    || payload?.persistentData !== false
    || payload?.noEnvironmentFiles !== true
    || !SHA_PATTERN.test(payload?.sourceSha ?? "")
  ) {
    fail("RELEASE_MANIFEST_INVALID", file);
  }
  if (payload.component !== "web" && payload.component !== "worker") fail("RELEASE_MANIFEST_INVALID", file);
  return { ...payload, sourceSha: payload.sourceSha.toLowerCase() };
}

module.exports = {
  RELEASE_IDENTITY_MANIFEST,
  SHA_PATTERN,
  readReleaseIdentityManifest,
  sourceCommitSha,
  writeReleaseIdentityManifest,
};
