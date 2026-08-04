import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("first encounter never autoplays its video when the shared quiet-presence fallback is static", () => {
  assert.match(page, /useQuietCompanionPresence\(\{ reducedMotion, replying: false \}\)/);
  assert.match(page, /const useStaticEncounter = presence === "static"/);
  assert.match(page, /state\.playbackUrl && !useStaticEncounter && !encounterViewed \? <div/);
  assert.match(page, /首次相遇影像不会自动播放/);
  assert.match(page, /onClick=\{continueToChat\}/);
});
