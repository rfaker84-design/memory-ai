"use strict";

const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const runtimeDirectory = path.join(root, ".next", "standalone-rc");
const outputDirectory = path.resolve(process.argv[2] || path.join(root, "artifacts", "production-candidate"));
const nodeVersion = "v20.20.2";
const npmVersion = "10.8.2";
const baseImage = "node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293";

function fail(message) {
  throw new Error(`PRODUCTION_CANDIDATE_EVIDENCE_INVALID:${message}`);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashFile(file) {
  return sha256(readFileSync(file));
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function listFiles(directory, relativeDirectory = "") {
  return readdirSync(path.join(directory, relativeDirectory), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) return listFiles(directory, relativePath);
      if (!entry.isFile()) return [];
      const absolutePath = path.join(directory, relativePath);
      return [{ path: relativePath, bytes: statSync(absolutePath).size, sha256: hashFile(absolutePath) }];
    });
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

if (process.version !== nodeVersion) fail(`node_version=${process.version};expected=${nodeVersion}`);
if (execFileSync("npm", ["--version"], { encoding: "utf8" }).trim() !== npmVersion) fail("npm_version");
if (!existsSync(runtimeDirectory)) fail("standalone_runtime_missing");

const runtimeFiles = listFiles(runtimeDirectory);
if (runtimeFiles.length === 0) fail("standalone_runtime_empty");
const runtimeDigest = sha256(runtimeFiles.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`).join(""));
const sourceCommit = process.env.PRODUCTION_CANDIDATE_SOURCE_COMMIT || git("rev-parse", "HEAD");
const sourceTree = process.env.PRODUCTION_CANDIDATE_SOURCE_TREE || git("rev-parse", "HEAD^{tree}");
if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) fail("source_commit");
if (!/^[0-9a-f]{40}$/i.test(sourceTree)) fail("source_tree");
if (!process.env.PRODUCTION_CANDIDATE_SOURCE_COMMIT && git("status", "--porcelain").length > 0) fail("source_tree_dirty");
const lockfile = path.join(root, "package-lock.json");
const dockerfile = path.join(root, "Dockerfile");

const manifest = {
  schemaVersion: 1,
  source: { commit: sourceCommit, tree: sourceTree },
  build: { node: nodeVersion.slice(1), npm: npmVersion, baseImage },
  inputs: {
    packageLockSha256: hashFile(lockfile),
    dockerfileSha256: hashFile(dockerfile),
  },
  runtime: {
    directory: ".next/standalone-rc",
    fileCount: runtimeFiles.length,
    bytes: runtimeFiles.reduce((sum, file) => sum + file.bytes, 0),
    sha256: runtimeDigest,
    files: runtimeFiles,
  },
};

const provenance = {
  _type: "https://in-toto.io/Statement/v1",
  subject: [{ name: "standalone-rc", digest: { sha256: runtimeDigest } }],
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://memoryai.example/build/production-candidate/v1",
      externalParameters: { dockerfile: "Dockerfile", target: "production-candidate-evidence-export" },
      internalParameters: { node: nodeVersion.slice(1), npm: npmVersion },
      resolvedDependencies: [
        { uri: "git+local", digest: { sha1: sourceCommit }, annotations: { gitTree: sourceTree } },
        { uri: "pkg:npm/memory-ai@0.1.0", digest: { sha256: hashFile(lockfile) } },
        { uri: `pkg:docker/library/node@20-alpine?digest=${baseImage.split("@")[1]}`, digest: { sha256: baseImage.split("@")[1].replace("sha256:", "") } },
      ],
    },
    runDetails: { builder: { id: "Dockerfile:production-candidate-evidence" }, metadata: { reproducible: true } },
  },
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, "manifest.json"), canonicalJson(manifest));
writeFileSync(path.join(outputDirectory, "provenance.intoto.json"), canonicalJson(provenance));
console.log(`PRODUCTION_CANDIDATE_MANIFEST_SHA256=${sha256(canonicalJson(manifest))}`);
console.log(`PRODUCTION_CANDIDATE_RUNTIME_SHA256=${runtimeDigest}`);
