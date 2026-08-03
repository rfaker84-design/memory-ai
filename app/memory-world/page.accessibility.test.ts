import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("companion home announces bounded cold-start and recovery states", () => {
  assert.match(page, /state === "loading" && <MemoryCard role="status" aria-live="polite">/);
  assert.match(page, /state === "error" \|\| state === "timeout"\) && <MemoryCard role="alert" aria-live="assertive">/);
  assert.match(page, /fetchCompanionHomeMemoriesJson\(fetch, signal\)/);
  assert.match(page, /<button type="button" onClick=\{\(\) => router\.push\("\/"\)\}/);
  assert.match(page, /<button key=\{item\.label\} type="button" onClick=\{\(\) => router\.push\(item\.href\)\}/);
  assert.match(page, /MemoryButton variant="secondary" onClick=\{\(\) => void load\(\)\}>重试/);
});
