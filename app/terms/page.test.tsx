import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("terms route requests to the verified in-app intake instead of an unverified support address", () => {
  assert.match(page, /href="\/report"/);
  assert.match(page, /请勿向未核验地址发送敏感材料/);
  assert.doesNotMatch(page, /support@yijianai\.cn/);
});
