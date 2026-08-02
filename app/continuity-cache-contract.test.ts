import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "app", "(continuity)", "continuity", "page.tsx"), "utf8");

test("continuity cache CTA clears presentation state with accessible in-page feedback", () => {
  assert.match(source, /clearPresentationCache\(window\.localStorage, window\.sessionStorage\)/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.doesNotMatch(source, /alert\(/);
});
