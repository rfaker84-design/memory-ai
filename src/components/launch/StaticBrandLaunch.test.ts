import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BRAND_LAUNCH_DURATION_MS,
  BRAND_LAUNCH_EXIT_MS,
  BRAND_LAUNCH_HOLD_MS,
  BRAND_LAUNCH_SESSION_KEY,
  createBrandLaunchGate,
} from "./staticBrandLaunchPolicy";

function memoryStorage(initialValue: string | null = null) {
  let value = initialValue;
  return {
    getItem(key: string) {
      return key === BRAND_LAUNCH_SESSION_KEY ? value : null;
    },
    setItem(key: string, nextValue: string) {
      if (key === BRAND_LAUNCH_SESSION_KEY) value = nextValue;
    },
  };
}

test("cold launch is claimed once per session and lasts within the Owner-approved window", () => {
  const gate = createBrandLaunchGate();
  const storage = memoryStorage();

  assert.equal(gate(storage), true);
  assert.equal(gate(storage), false);
  assert.ok(BRAND_LAUNCH_DURATION_MS >= 1200);
  assert.ok(BRAND_LAUNCH_DURATION_MS <= 1800);
  assert.equal(BRAND_LAUNCH_HOLD_MS + BRAND_LAUNCH_EXIT_MS, BRAND_LAUNCH_DURATION_MS);
});

test("a new runtime does not repeat a launch already recorded in session storage", () => {
  const gate = createBrandLaunchGate();
  assert.equal(gate(memoryStorage("1")), false);
});

test("the splash uses the exact approved copy, real background, and restrained motion", () => {
  const component = readFileSync("src/components/launch/StaticBrandLaunch.tsx", "utf8");
  const styles = readFileSync("src/components/launch/StaticBrandLaunch.module.css", "utf8");

  assert.match(component, /忆见/);
  assert.match(component, /忆一人 见一生/);
  assert.match(component, /owner-confirmed-warm-presence\.png/);
  assert.match(component, /if \(!minimumElapsed \|\| !ready\) return/);
  assert.match(component, /setExiting\(true\)/);
  assert.match(styles, /\.exiting \{[\s\S]*?opacity: 0/);
  assert.match(styles, /transition: opacity 250ms ease-out/);
  assert.match(styles, /@keyframes brand-arrival/);
  assert.match(styles, /@keyframes tagline-arrival/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(component, /MEMORYAI|AI |轻轻相遇中|正在进入忆见|仍在这里|温柔抵达/);
  assert.doesNotMatch(component, /fetch\(|button|progress|百分比|loading/i);
  assert.doesNotMatch(styles, /bounce|rotate|scale\(/i);
});
