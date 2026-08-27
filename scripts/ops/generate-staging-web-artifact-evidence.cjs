"use strict";

// Runs only inside the locked Linux BuildKit builder.  The resulting bundle
// is deliberately a deployable standalone runtime, never a source checkout.
const crypto = require("node:crypto");
const { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const [runtimeDirectory, outputDirectory] = process.argv.slice(2);
const sourceCommit = process.env.STAGING_WEB_ARTIFACT_SOURCE_COMMIT;
const sourceTree = process.env.STAGING_WEB_ARTIFACT_SOURCE_TREE;
const baseImage = "node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293";
const nodeVersion = "v20.20.2";
const npmVersion = "10.8.2";

function fail(code, detail) {
  throw new Error(`${code}${detail === undefined ? "" : `:${detail}`}`);
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashFile(file) {
  return hash(readFileSync(file));
}

function sha(value, code) {
  if (!/^[0-9a-f]{40}$/iu.test(value ?? "")) fail(code, value);
  return value.toLowerCase();
}

function files(directory, relative = "") {
  return readdirSync(path.join(directory, relative), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const name = path.posix.join(relative, entry.name);
      const absolute = path.join(directory, name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) fail("STAGING_WEB_ARTIFACT_SYMLINK_FORBIDDEN", name);
      if (entry.isDirectory()) return files(directory, name);
      if (entry.isFile()) return [{ path: name, bytes: stat.size, sha256: hashFile(absolute) }];
      fail("STAGING_WEB_ARTIFACT_ENTRY_INVALID", name);
    });
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
}

function clientFeatureProof(buildRoot) {
  const staticDirectory = path.join(buildRoot, ".next", "static");
  if (!existsSync(staticDirectory)) fail("STAGING_WEB_ARTIFACT_CLIENT_OUTPUT_MISSING");
  const candidates = files(staticDirectory).filter((file) => file.path.endsWith(".js"));
  const soundscapeChunks = candidates.filter((file) => readFileSync(path.join(staticDirectory, file.path), "utf8").includes("memoryai.soundscape.v1"));
  if (soundscapeChunks.length === 0) fail("STAGING_WEB_ARTIFACT_SOUNDSCAPE_CLIENT_CHUNK_MISSING");
  if (soundscapeChunks.some((file) => readFileSync(path.join(staticDirectory, file.path), "utf8").includes("NEXT_PUBLIC_SOUNDSCAPE_ENABLED"))) {
    fail("STAGING_WEB_ARTIFACT_FEATURE_FLAG_NOT_BAKED");
  }
  return soundscapeChunks.map(({ path: file, sha256 }) => ({ path: `.next/static/${file}`, sha256 }));
}

if (process.platform !== "linux") fail("STAGING_WEB_ARTIFACT_LINUX_REQUIRED", process.platform);
if (process.version !== nodeVersion) fail("STAGING_WEB_ARTIFACT_NODE_VERSION_INVALID", process.version);
if (require("node:child_process").execFileSync("npm", ["--version"], { encoding: "utf8" }).trim() !== npmVersion) fail("STAGING_WEB_ARTIFACT_NPM_VERSION_INVALID");
if (process.env.NEXT_PUBLIC_SOUNDSCAPE_ENABLED !== "true") fail("STAGING_WEB_ARTIFACT_FEATURE_FLAG_INVALID");
if (!runtimeDirectory || !outputDirectory || !existsSync(runtimeDirectory)) fail("STAGING_WEB_ARTIFACT_RUNTIME_MISSING");

const expectedCommit = sha(sourceCommit, "STAGING_WEB_ARTIFACT_SOURCE_COMMIT_INVALID");
const expectedTree = sha(sourceTree, "STAGING_WEB_ARTIFACT_SOURCE_TREE_INVALID");
const runtime = path.resolve(runtimeDirectory);
const output = path.resolve(outputDirectory);
const buildRoot = path.resolve(process.env.STAGING_WEB_ARTIFACT_BUILD_ROOT ?? "");
const recipe = path.resolve(process.env.STAGING_WEB_ARTIFACT_RECIPE ?? "");
if (!existsSync(buildRoot) || !existsSync(recipe)) fail("STAGING_WEB_ARTIFACT_BUILD_INPUT_MISSING");

mkdirSync(output, { recursive: true, mode: 0o755 });
const releaseManifest = {
  version: 1,
  immutable: true,
  rebuildable: true,
  persistentData: false,
  noEnvironmentFiles: true,
  sourceSha: expectedCommit,
  component: "web",
};
writeJson(path.join(runtime, "release-manifest.json"), releaseManifest);

const runtimeFiles = files(runtime);
if (runtimeFiles.length === 0) fail("STAGING_WEB_ARTIFACT_RUNTIME_EMPTY");
const runtimeDigest = hash(runtimeFiles.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`).join(""));
const featureProof = clientFeatureProof(buildRoot);
const lockfile = path.join(buildRoot, "package-lock.json");
if (!existsSync(lockfile)) fail("STAGING_WEB_ARTIFACT_LOCKFILE_MISSING");

const manifest = {
  schemaVersion: 1,
  source: { commit: expectedCommit, tree: expectedTree },
  component: "web",
  build: {
    platform: "linux/amd64",
    node: nodeVersion.slice(1),
    npm: npmVersion,
    baseImage,
    featureFlags: { NEXT_PUBLIC_SOUNDSCAPE_ENABLED: true },
    featureProof: { compiledClientChunks: featureProof, environmentReferenceAbsent: true },
  },
  inputs: { packageLockSha256: hashFile(lockfile), buildRecipeSha256: hashFile(recipe) },
  runtime: {
    directory: "runtime",
    fileCount: runtimeFiles.length,
    bytes: runtimeFiles.reduce((total, file) => total + file.bytes, 0),
    sha256: runtimeDigest,
    files: runtimeFiles,
  },
};
const provenance = {
  _type: "https://in-toto.io/Statement/v1",
  subject: [{ name: "memoryai-staging-web-standalone", digest: { sha256: runtimeDigest } }],
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://memoryai.example/build/staging-web-immutable/v1",
      externalParameters: { target: "staging-web-artifact-export", featureFlag: "NEXT_PUBLIC_SOUNDSCAPE_ENABLED=true" },
      internalParameters: { node: nodeVersion.slice(1), npm: npmVersion, platform: "linux/amd64" },
      resolvedDependencies: [
        { uri: "git+repository", digest: { sha1: expectedCommit }, annotations: { gitTree: expectedTree } },
        { uri: "pkg:npm/memory-ai@0.1.0", digest: { sha256: hashFile(lockfile) } },
        { uri: `pkg:docker/library/node@20-alpine?digest=${baseImage.split("@")[1]}`, digest: { sha256: baseImage.split("sha256:")[1] } },
      ],
    },
    runDetails: { builder: { id: "github-actions-buildkit-staging-web-artifact" }, metadata: { reproducible: true } },
  },
};

writeJson(path.join(output, "release-manifest.json"), releaseManifest);
writeJson(path.join(output, "manifest.json"), manifest);
writeJson(path.join(output, "provenance.intoto.json"), provenance);
console.log(`STAGING_WEB_ARTIFACT_RUNTIME_SHA256=${runtimeDigest}`);
console.log(`STAGING_WEB_ARTIFACT_MANIFEST_SHA256=${hashFile(path.join(output, "manifest.json"))}`);
