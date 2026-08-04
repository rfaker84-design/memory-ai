import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

test("mobile shell labels AI memorial conversation and never makes a living-presence claim", () => {
  assert.match(source, /AI纪念陪伴/);
  assert.match(source, /AI生成 · 基于已确认资料/);
  assert.doesNotMatch(source, /我在。关于|我一直在听|TA 在这里|让 TA 出现|继续相见/);
});
