"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { MARKER, managedCrontab } = require("./staging-qwen-synthetic-cleanup-schedule.cjs");

test("cleanup schedule replaces only its owned crontab block", () => {
  const tool = "/home/ubuntu/memoryai-staging/tools/qwen-e2e-0123456789abcdef0123456789abcdef01234567/staging-qwen-real-e2e.cjs";
  const output = managedCrontab(`0 1 * * * /usr/bin/true\n${MARKER}\n*/5 * * * * old /home/ubuntu/memoryai-staging/tools/qwen-e2e-deadbeef/staging-qwen-real-e2e.cjs\n`, "/usr/bin/node", tool);
  assert.equal((output.match(new RegExp(MARKER, "g")) ?? []).length, 1);
  assert.match(output, /\*\/5 \* \* \* \*/u);
  assert.doesNotMatch(output, /deadbeef/u);
});
