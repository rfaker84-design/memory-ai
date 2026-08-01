import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("report page uses the tracked intake and never advertises an unverified contact address", () => {
  assert.match(page, /<ReportIntake \/>/);
  assert.match(page, /当前尚未配置时/);
  assert.match(page, /请勿向未核验地址发送身份材料/);
  assert.doesNotMatch(page, /support@yijianai\.cn|legal@yijianmemory\.cn|privacy@yijianmemory\.cn/);
});
