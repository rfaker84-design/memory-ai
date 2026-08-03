import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AccountProfilePanel.tsx", import.meta.url), "utf8");

test("account profile waits for its authenticated read before allowing a birthday mutation", () => {
  assert.match(source, /"loading" \| "ready" \| "unauthenticated" \| "unavailable"/);
  assert.match(source, /if \(saving \|\| loadState !== "ready"\) return/);
  assert.match(source, /loadState === "unauthenticated"[\s\S]*?<Link href="\/login">/);
  assert.match(source, /loadState === "unavailable"[\s\S]*?onClick=\{\(\) => void load\(\)\}/);
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /return \(\) => controller\.abort\(\)/);
  assert.match(source, /error\.code === "UNAUTHENTICATED"/);
});
