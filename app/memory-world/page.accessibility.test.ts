import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("companion home announces bounded cold-start and recovery states", () => {
  assert.match(page, /state === "loading" && <MemoryCard role="status" aria-live="polite">/);
  assert.match(page, /state === "error" \|\| state === "timeout"\) && <MemoryCard role="alert" aria-live="assertive">/);
  assert.match(page, /fetchCompanionHomeMemoriesJson\(fetch, signal\)/);
  assert.match(page, /<button type="button" onClick=\{\(\) => router\.push\("\/"\)\}/);
  assert.doesNotMatch(page, /<nav aria-label="主导航"/);
  assert.match(page, /MemoryButton variant="secondary" onClick=\{\(\) => void load\(\)\}>重试/);
  assert.match(page, /state === "unauthenticated"[\s\S]*?<MemoryButton href="\/login" variant="primary">/);
  assert.match(page, /state === "empty"[\s\S]*?<MemoryButton variant="primary" onClick=\{\(\) => router\.push\("\/create-memory"\)\}>/);
});

test("companion home opens the primary-TA selector from the current portrait and keeps it in the shared bottom sheet", () => {
  assert.match(page, /MemoryBottomSheet/);
  assert.match(page, /onClick=\{\(\) => setPrimarySelectorOpen\(true\)\}/);
  assert.match(page, /aria-haspopup="dialog"/);
  assert.match(page, /primarySelectorOpen && <MemoryBottomSheet open/);
  assert.match(page, /setPrimarySelectorOpen\(false\)/);
  assert.match(page, /设 \$\{memory\.name\} 为主 TA/);
});
