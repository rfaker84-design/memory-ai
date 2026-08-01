import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("continuous-chat context rechecks TA ownership through the authenticated external user", () => {
  const source = readFileSync(new URL("./context-builder.ts", import.meta.url), "utf8");
  assert.match(source, /getMemoryForUser\(input\.memoryId, input\.userId\)/);
  assert.doesNotMatch(source, /getMemory\(input\.memoryId\)/);
});
