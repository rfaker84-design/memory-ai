const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = readFileSync(path.join(__dirname, "generate-production-candidate-evidence.cjs"), "utf8");

test("production candidate evidence fails closed outside the Linux Docker builder", () => {
  assert.match(source, /process\.platform !== "linux"/);
  assert.match(source, /platform=\$\{process\.platform\};expected=linux/);
  assert.ok(
    source.indexOf('process.platform !== "linux"') < source.indexOf("mkdirSync(outputDirectory"),
    "platform validation must run before evidence files can be written",
  );
});
