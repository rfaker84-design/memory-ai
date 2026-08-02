import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("crisis-support consent cannot mutate until its authenticated status is known", () => {
  assert.match(page, /loadState.*"loading".*"ready".*"unauthenticated".*"unavailable"/);
  assert.match(page, /if \(loadState !== "ready" \|\| busy\) return/);
  assert.match(page, /loadState === "unavailable"[\s\S]*重新读取/);
  assert.match(page, /loadState === "unauthenticated"[\s\S]*前往登录/);
  assert.match(page, /loadState === "ready"[\s\S]*预授权内部危机支持/);
  assert.match(page, /new AbortController\(\)/);
  assert.match(page, /signal\?\.aborted/);
  assert.match(page, /不代表已经联系任何外部人员/);
});
