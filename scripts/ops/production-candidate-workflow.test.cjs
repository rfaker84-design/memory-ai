const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workflow = readFileSync(
  path.join(__dirname, "../../.github/workflows/production-candidate-evidence.yml"),
  "utf8",
);
const exporter = readFileSync(
  path.join(__dirname, "export-production-candidate-evidence.sh"),
  "utf8",
);

test("candidate workflow accepts only an explicit immutable commit and exports BuildKit evidence", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /source_commit:\s*[\s\S]*?required: true/);
  assert.match(workflow, /ref: \$\{\{ inputs\.source_commit \}\}/);
  assert.match(workflow, /test "\$\{\{ inputs\.source_commit \}\}" = "\$\(git rev-parse HEAD\)"/);
  assert.match(workflow, /scripts\/ops\/export-production-candidate-evidence\.sh/);
  assert.match(workflow, /sha256sum --check SHA256SUMS/);
  assert.match(exporter, /exec docker buildx build/);
  assert.match(exporter, /--target production-candidate-evidence-export/);
  assert.match(exporter, /--output "type=local,dest=\$output"/);
  assert.doesNotMatch(exporter, /exec docker build \\/);
});

test("candidate workflow is read-only toward deployment systems", () => {
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow, /\b(?:ssh|pm2|nginx|kubectl|helm|deploy-production)\b/i);
  assert.match(workflow, /actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683/);
  assert.match(workflow, /actions\/upload-artifact@65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08/);
});
