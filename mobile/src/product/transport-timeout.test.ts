import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./api.ts", import.meta.url), "utf8");

test("mobile transport bounds stalled requests with a stable timeout error and no retry loop", () => {
  assert.match(source, /export const MOBILE_API_TIMEOUT_MS = 12_000/);
  assert.match(source, /const timer = globalThis\.setTimeout\(\(\) => \{ timedOut = true; controller\.abort\(\); \}, timeoutMs\)/);
  assert.match(source, /if \(timedOut\) throw new ProductApiError\(408,/);
  assert.match(source, /globalThis\.clearTimeout\(timer\)/);
  assert.match(source, /return await boundedMobileFetch\(apiUrl\(path\)/);
  assert.doesNotMatch(source, /setInterval\(|retry.*boundedMobileFetch|boundedMobileFetch.*retry/is);
});
