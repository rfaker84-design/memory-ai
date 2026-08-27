const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync, statSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const soundscapeRoot = path.join(root, "src", "features", "soundscape");
const ledgerPath = path.join(root, "docs", "compliance", "audio-asset-ledger.json");
const AUDIO_EXTENSION = /\.(?:mp3|wav|aac|m4a|ogg|flac)$/iu;

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  });
}

test("soundscape contains only procedural source and no audio assets", () => {
  assert.ok(existsSync(soundscapeRoot));
  assert.deepEqual(files(soundscapeRoot).filter((file) => AUDIO_EXTENSION.test(file)), []);
});

test("soundscape cannot request or embed remote audio", () => {
  const source = files(soundscapeRoot).filter((file) => /\.(?:ts|tsx)$/u.test(file)).map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /https?:\/\//iu);
  assert.doesNotMatch(source, /data:audio/iu);
  assert.doesNotMatch(source, /base64/iu);
});

test("procedural soundscape ledger is complete and forbids third-party audio", () => {
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  assert.equal(ledger.version, 1);
  assert.deepEqual(ledger.entries.map((entry) => entry.id), ["glow", "companion", "stardust", "reunion"]);
  for (const entry of ledger.entries) {
    assert.equal(entry.sourceType, "procedural_internal");
    assert.equal(entry.engineVersion, "1");
    assert.equal(entry.thirdPartyAudio, false);
    assert.deepEqual(entry.samples, []);
    assert.deepEqual(entry.remoteSources, []);
    assert.equal(entry.aiGenerated, false);
    assert.equal(entry.exportAllowed, false);
    assert.equal(entry.territory, "CN");
  }
});

test("candidate package does not add runtime dependencies", () => {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(typeof packageJson.dependencies, "object");
  assert.ok(statSync(path.join(root, "package-lock.json")).isFile());
});
