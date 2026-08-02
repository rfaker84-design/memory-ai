import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./[id]/pickup/page.tsx", import.meta.url), "utf8");
const index = readFileSync(new URL("../(memory)/memory/page.tsx", import.meta.url), "utf8");

test("pickup is an explicit-confirmation flow and never relies on ordinary-chat or browser persistence", () => {
  assert.match(source, /confirmed: true/);
  assert.match(source, /idempotency-key/);
  assert.match(source, /原话与整理稿准确/);
  assert.match(source, /按原话分段整理草稿/);
  assert.match(source, /编辑/);
  assert.match(source, /删除/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /memory-chat/);
  assert.match(index, /用户主动确认式资料/);
  assert.match(index, /\/pickup/);
});
