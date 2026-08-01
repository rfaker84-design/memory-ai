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

test("retired deployment guides cannot direct a source-checkout release", () => {
  for (const file of retiredGuides) {
    const source = read(file);
    assert.match(source, /Status: \*\*RETIRED/);
    assert.match(source, /production-candidate-build\.md/);
    assert.doesNotMatch(source, /git pull|npm install|npm run build|pm2 restart/i);
  }
});
