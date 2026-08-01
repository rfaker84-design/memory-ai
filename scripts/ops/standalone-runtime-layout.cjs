const assert = require("node:assert/strict");
const { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const MANIFEST_FILE = "standalone-manifest.json";
const LAUNCHER_FILE = "run-standalone-from-manifest.cjs";
const LAYOUT_FILE = "standalone-runtime-layout.cjs";
const RUNTIME_CONTRACT_FILE = "production-runtime-contract.cjs";

function fail(code, detail) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

function findServerEntries(directory, relativeDirectory = "") {
  const entries = readdirSync(path.join(directory, relativeDirectory), { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") candidates.push(...findServerEntries(directory, relativePath));
    } else if (entry.isFile() && entry.name === "server.js") {
      candidates.push(relativePath.split(path.sep).join("/"));
    }
  }
  return candidates;
}

function discoverStandaloneEntry(standaloneDirectory) {
  if (!existsSync(standaloneDirectory)) fail("STANDALONE_DIRECTORY_MISSING", standaloneDirectory);
  const candidates = findServerEntries(standaloneDirectory);
  if (candidates.length === 0) fail("STANDALONE_SERVER_ENTRY_MISSING", standaloneDirectory);
  if (candidates.length !== 1) fail("STANDALONE_SERVER_ENTRY_AMBIGUOUS", candidates.join(","));
  return candidates[0];
}

function validateServerEntry(serverEntry) {
  if (
    typeof serverEntry !== "string"
    || !serverEntry
    || path.isAbsolute(serverEntry)
    || serverEntry.split("/").some((part) => part === ".." || !part)
    || !serverEntry.endsWith("/server.js") && serverEntry !== "server.js"
  ) {
    fail("STANDALONE_MANIFEST_INVALID", String(serverEntry));
  }
}

function readStandaloneManifest(runtimeDirectory) {
  const manifestPath = path.join(runtimeDirectory, MANIFEST_FILE);
  if (!existsSync(manifestPath)) fail("STANDALONE_MANIFEST_MISSING", manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== 1) fail("STANDALONE_MANIFEST_INVALID", "version");
  validateServerEntry(manifest.serverEntry);
  return manifest;
}

function packageStandaloneRuntime({ standaloneDirectory, outputDirectory, publicDirectory, staticDirectory }) {
  if (existsSync(outputDirectory)) fail("STANDALONE_OUTPUT_ALREADY_EXISTS", outputDirectory);
  const serverEntry = discoverStandaloneEntry(standaloneDirectory);
  cpSync(standaloneDirectory, outputDirectory, { recursive: true });

  const applicationDirectory = path.join(outputDirectory, path.dirname(serverEntry));
  if (!existsSync(path.join(outputDirectory, serverEntry))) fail("STANDALONE_SERVER_ENTRY_MISSING", serverEntry);
  cpSync(publicDirectory, path.join(applicationDirectory, "public"), { recursive: true });
  mkdirSync(path.join(applicationDirectory, ".next"), { recursive: true });
  cpSync(staticDirectory, path.join(applicationDirectory, ".next", "static"), { recursive: true });
  cpSync(path.join(__dirname, LAUNCHER_FILE), path.join(outputDirectory, LAUNCHER_FILE));
  cpSync(path.join(__dirname, LAYOUT_FILE), path.join(outputDirectory, LAYOUT_FILE));
  cpSync(
    path.join(__dirname, "../../src/server/auth/production-runtime-contract.cjs"),
    path.join(outputDirectory, RUNTIME_CONTRACT_FILE),
  );
  writeFileSync(
    path.join(outputDirectory, MANIFEST_FILE),
    `${JSON.stringify({ version: 1, serverEntry }, null, 2)}\n`,
  );
  return { serverEntry, applicationDirectory, manifestPath: path.join(outputDirectory, MANIFEST_FILE) };
}

function assertManifestEntryResolves(runtimeDirectory) {
  const manifest = readStandaloneManifest(runtimeDirectory);
  const entryPath = path.resolve(runtimeDirectory, manifest.serverEntry);
  const relative = path.relative(runtimeDirectory, entryPath);
  assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative));
  if (!existsSync(entryPath)) fail("STANDALONE_SERVER_ENTRY_MISSING", manifest.serverEntry);
  return { ...manifest, entryPath, applicationDirectory: path.dirname(entryPath) };
}

module.exports = {
  LAUNCHER_FILE,
  LAYOUT_FILE,
  RUNTIME_CONTRACT_FILE,
  MANIFEST_FILE,
  assertManifestEntryResolves,
  discoverStandaloneEntry,
  packageStandaloneRuntime,
  readStandaloneManifest,
};
