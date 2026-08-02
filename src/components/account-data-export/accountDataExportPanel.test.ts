import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AccountDataExportPanel.tsx", import.meta.url), "utf8");

test("account-data export uses a bounded, user-controlled download and never claims uncertain delivery failed", () => {
  assert.match(source, /ACCOUNT_EXPORT_TIMEOUT_MS = 12_000/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /activeRequest\.current !== controller/);
  assert.match(source, /不会自动重试/);
  assert.match(source, /无法确认资料副本是否已经开始下载/);
  assert.doesNotMatch(source, /未生成或保存任何资料副本/);
});
