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
});
