import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./SessionGateUnavailable.tsx", import.meta.url), "utf8");

test("session-gated legacy surfaces fail closed after a bounded session check", () => {
  assert.match(source, /SESSION_CHECK_TIMEOUT_MS = 12_000/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /controller\.abort\(\); globalThis\.clearTimeout\(timer\)/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /setState\("unavailable"\)/);
});

test("publicly reachable admin aliases contain only the disabled session gate, never an operations dashboard", () => {
  for (const page of [
    "app/admin/page.tsx",
    "app/admin/dashboard/page.tsx",
    "app/admin/analytics/page.tsx",
    "app/admin/revenue/page.tsx",
    "app/admin/viral/page.tsx",
  ]) {
    const content = readFileSync(page, "utf8");
    assert.match(content, /SessionGateUnavailable/);
    assert.doesNotMatch(content, /fetch\(|\/api\/internal|\/api\/admin/);
  }
});
