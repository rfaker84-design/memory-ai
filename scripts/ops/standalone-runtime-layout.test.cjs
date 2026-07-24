const assert = require("node:assert/strict");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  LAUNCHER_FILE,
  assertManifestEntryResolves,
  discoverStandaloneEntry,
  packageStandaloneRuntime,
} = require("./standalone-runtime-layout.cjs");

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "standalone-layout-"));
  const standalone = path.join(root, "standalone");
  const publicDirectory = path.join(root, "public");
  const staticDirectory = path.join(root, "static");
  mkdirSync(standalone, { recursive: true });
  mkdirSync(publicDirectory, { recursive: true });
  mkdirSync(staticDirectory, { recursive: true });
  writeFileSync(path.join(publicDirectory, "asset.txt"), "public");
  writeFileSync(path.join(staticDirectory, "asset.txt"), "static");
  return { root, standalone, publicDirectory, staticDirectory };
}

test("root standalone entry remains a relative serverEntry", () => {
  const x = fixture();
  try {
    writeFileSync(path.join(x.standalone, "server.js"), "module.exports = {};\n");
    assert.equal(discoverStandaloneEntry(x.standalone), "server.js");
  } finally { rmSync(x.root, { recursive: true, force: true }); }
});

test("nested tracing-root entry receives public and static assets at its application directory", () => {
  const x = fixture();
  try {
    const nested = path.join(x.standalone, "apps", "web");
    mkdirSync(path.join(nested, "node_modules", "ignored"), { recursive: true });
    writeFileSync(path.join(nested, "server.js"), "if (process.cwd() !== __dirname) process.exit(1);\n");
    writeFileSync(path.join(nested, "node_modules", "ignored", "server.js"), "ignored\n");
    const outputDirectory = path.join(x.root, "rc");
    const packaged = packageStandaloneRuntime({
      standaloneDirectory: x.standalone,
      outputDirectory,
      publicDirectory: x.publicDirectory,
      staticDirectory: x.staticDirectory,
    });
    assert.equal(packaged.serverEntry, "apps/web/server.js");
    assert.ok(existsSync(path.join(outputDirectory, "apps", "web", "public", "asset.txt")));
    assert.ok(existsSync(path.join(outputDirectory, "apps", "web", ".next", "static", "asset.txt")));
    assert.deepEqual(JSON.parse(readFileSync(packaged.manifestPath, "utf8")), {
      version: 1,
      serverEntry: "apps/web/server.js",
    });
    assert.equal(assertManifestEntryResolves(outputDirectory).applicationDirectory, path.join(outputDirectory, "apps", "web"));
    assert.equal(
      spawnSync(process.execPath, [LAUNCHER_FILE], { cwd: outputDirectory }).status,
      0,
      "manifest launcher must start the nested entry with its own cwd",
    );
  } finally { rmSync(x.root, { recursive: true, force: true }); }
});

test("missing and ambiguous standalone entries fail closed", () => {
  const x = fixture();
  try {
    assert.throws(() => discoverStandaloneEntry(x.standalone), /STANDALONE_SERVER_ENTRY_MISSING/);
    writeFileSync(path.join(x.standalone, "server.js"), "root\n");
    mkdirSync(path.join(x.standalone, "nested"));
    writeFileSync(path.join(x.standalone, "nested", "server.js"), "nested\n");
    assert.throws(() => discoverStandaloneEntry(x.standalone), /STANDALONE_SERVER_ENTRY_AMBIGUOUS/);
  } finally { rmSync(x.root, { recursive: true, force: true }); }
});
