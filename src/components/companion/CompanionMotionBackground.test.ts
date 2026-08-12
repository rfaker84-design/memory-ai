import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("./CompanionMotionBackground.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./CompanionMotionBackground.module.css", import.meta.url), "utf8");

test("owner motion loads the durable pack before ensuring missing slots and never blocks its still portrait", () => {
  assert.match(component, /await loadCompanionMotionPack\(memoryId, controller\.signal\)/);
  assert.match(component, /companionMotionPackNeedsEnsure\(next\)[\s\S]*ensureCompanionMotionPackOnce\(memoryId\)/);
  assert.match(component, /<img[\s\S]*data-motion-still="true"[\s\S]*src=\{portraitUrl\}/);
  assert.doesNotMatch(component, /home-hero|visitor-demo|initial_preview|encounter-playback|provider/i);
});

test("owner motion crossfades silent inline loops and reduced motion remains fully static", () => {
  assert.match(component, /<video[\s\S]*muted[\s\S]*loop[\s\S]*playsInline/);
  assert.match(component, /data-visible=\{visibleVariant === motionVariant/);
  assert.match(component, /videoNodes\.current\.get\(previous\)\?\.pause\(\)/);
  assert.match(css, /transition: opacity 900ms/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*display: none !important/);
  assert.match(component, /motionEnabled && Object\.entries\(sources\)/);
});
