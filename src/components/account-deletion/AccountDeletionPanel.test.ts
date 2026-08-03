import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AccountDeletionPanel.tsx", import.meta.url), "utf8");

test("account deletion never renders a new request form before its status read is known", () => {
  assert.match(source, /loadState, setLoadState/);
  assert.match(source, /loadState === "unauthenticated"[\s\S]*?<Link href="\/login">/);
  assert.match(source, /loadState === "unavailable"[\s\S]*?重新读取/);
  assert.match(source, /loadState === "unavailable"[\s\S]*?return <main/);
  assert.match(source, /!progress\.completedAt[\s\S]*?刷新进度/);
  assert.match(source, /body\.error === "UNAUTHENTICATED"/);
  assert.match(source, /ACCOUNT_DELETION_STATUS_TIMEOUT_MS = 12_000/);
  assert.match(source, /ACCOUNT_DELETION_SUBMIT_TIMEOUT_MS = 20_000/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /未创建新的注销申请/);
  assert.match(source, /注销提交结果尚未确认/);
  assert.match(source, /ACCOUNT_DELETION_RECEIPT_REQUIRED/);
  assert.match(source, /安全回执已准备好/);
  assert.match(source, /new AbortController\(\)/);
});
