import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

test("mobile launch navigation is limited to Companion, Pickup, and Mine, and never appears in chat or details", () => {
  assert.match(source, /launchLabels: Partial<Record<Screen, string>> = \{ home: "相伴", memory: "拾忆", profile: "我的" \}/);
  assert.match(source, /items\.filter\(\(\[screen\]\) => screen in launchLabels\)/);
  assert.match(source, /if \(active === "chat" \|\| active === "memory"\) return null/);
  assert.doesNotMatch(source, /launchLabels:[\s\S]*chat:/);
  assert.match(styles, /grid-template-columns: repeat\(3, 1fr\)/);
  assert.doesNotMatch(styles, /grid-template-columns: repeat\(4, 1fr\)/);
});

test("the mobile product shell never offers save or share controls for a first preview", () => {
  assert.doesNotMatch(source, /saveSignedVideo/);
  assert.doesNotMatch(source, /Share\.share/);
  assert.doesNotMatch(source, /previewVideoUrl/);
  assert.doesNotMatch(source, /galleryScene/);
});
