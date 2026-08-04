import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("first encounter keeps a visible, non-interactive AI disclosure over playable video", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /data-ai-generated-overlay="true"/);
  assert.match(page, /AI 生成纪念影像/);
  assert.match(page, /pointerEvents: "none"/);
  assert.match(page, /memoryai\.initial-encounter-viewed/);
  assert.match(page, /window\.localStorage\.setItem\(encounterViewedKey\(memoryId\), "viewed"\)/);
  assert.match(page, /onPlay=\{markEncounterViewed\}/);
  assert.match(page, /!encounterViewed/);
  assert.match(page, /controlsList="nodownload noremoteplayback"/);
});
