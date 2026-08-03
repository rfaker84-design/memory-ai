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
