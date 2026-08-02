import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./FirstPresenceFlow.tsx", import.meta.url), "utf8");

test("first-presence confirmation uses neutral creation wording, not an arrival or reunion claim", () => {
  assert.match(source, /确认资料并创建 TA/);
  assert.doesNotMatch(source, /让 TA 来到这里/);
  assert.doesNotMatch(source, /到我这里来/);
});
