import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveQuietCompanionState } from "./quietCompanionPresence";

test("quiet companion becomes static for reduced-motion, low-battery, or constrained-performance signals", () => {
  assert.equal(resolveQuietCompanionState({ reducedMotion: true, lowBattery: false, constrainedPerformance: false, replying: true }), "static");
  assert.equal(resolveQuietCompanionState({ reducedMotion: false, lowBattery: true, constrainedPerformance: false, replying: true }), "static");
  assert.equal(resolveQuietCompanionState({ reducedMotion: false, lowBattery: false, constrainedPerformance: true, replying: true }), "static");
  assert.equal(resolveQuietCompanionState({ reducedMotion: false, lowBattery: false, constrainedPerformance: false, replying: false }), "quiet");
  assert.equal(resolveQuietCompanionState({ reducedMotion: false, lowBattery: false, constrainedPerformance: false, replying: true }), "replying");
});

test("companion scene uses an independent quiet state and never loops a first-meeting video", () => {
  const presence = readFileSync(new URL("./quietCompanionPresence.ts", import.meta.url), "utf8");
  const scene = readFileSync(new URL("./MemoryConversationScene.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./MemoryConversationScene.module.css", import.meta.url), "utf8");
  assert.match(scene, /useQuietCompanionPresence/);
  assert.match(scene, /data-presence=\{quietPresence\}/);
  assert.doesNotMatch(scene, /<video|\bloop\b|audioRef|lip/);
  assert.match(css, /data-presence="static"/);
  assert.match(css, /data-presence="static"\] \.portraitPhoto/);
  assert.match(css, /@keyframes sceneBreath/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.portraitPhoto \{ animation: none !important;/);
  assert.match(presence, /connection\?\.saveData === true/);
  assert.match(presence, /connection\?\.effectiveType === "2g"/);
  assert.match(presence, /document\.visibilityState !== "visible"/);
  assert.doesNotMatch(presence, /getThermalState|thermalState/);
});
