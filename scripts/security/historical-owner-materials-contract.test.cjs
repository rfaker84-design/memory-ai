const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const source = readFileSync(join(__dirname, "..", "..", "docs/Release/WAVE1_USER_ACTION_PACK.md"), "utf8");

test("historical Wave1 owner material cannot override the live control plane", () => {
  assert.match(source, /历史材料说明/);
  for (const control of [
    "MEMORYAI_LAUNCH_GATES.yaml",
    "MEMORYAI_OWNER_ACTIONS.yaml",
    "MEMORYAI_CURRENT_STATE.yaml",
    "MEMORYAI_EVIDENCE_LEDGER.yaml",
  ]) assert.match(source, new RegExp(control.replace(".", "\\.")));
  assert.match(source, /不能作为当前执行排期或 Gate 状态/);
});
