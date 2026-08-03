const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const retiredGuides = [
  "docs/Deployment/production-deployment-v1.md",
  "docs/Deployment/release-and-rollback-v1.md",
];
const releaseRunbook = "docs/Deployment/immutable-artifact-release-runbook.md";

test("retired deployment guides cannot direct a source-checkout release", () => {
  for (const file of retiredGuides) {
    const source = read(file);
    assert.match(source, /Status: \*\*RETIRED/);
    assert.match(source, /production-candidate-build\.md/);
    assert.doesNotMatch(source, /git pull|npm install|npm run build|pm2 restart/i);
  }
});

test("current release runbook is immutable-artifact based and cannot authorize an unchecked source release", () => {
  const source = read(releaseRunbook);
  for (const expected of [
    "PLANNING ONLY — PRODUCTION_RELEASE_NO_GO",
    "manifest.json",
    "sbom.spdx.json",
    "provenance.intoto.json",
    "SHA256SUMS",
    "Owner-approved maintenance-window record",
    "new immutable release directory",
    "new PID and candidate cwd",
    "Database restore or destructive schema rollback requires a separate approved",
    "72 hours",
  ]) assert.ok(source.includes(expected), `missing release-runbook control: ${expected}`);

  // These phrases must be documented as forbidden deployment inputs. A broad
  // substring ban would incorrectly reject that explicit safety guidance.
  assert.match(source, /`git pull`, `npm install`, local rebuild, mutable symlink target, or\s+artifact without a matching manifest is never a release unit/i);
});
