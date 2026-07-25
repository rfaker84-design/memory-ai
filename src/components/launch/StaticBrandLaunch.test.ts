import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BRAND_LAUNCH_DURATION_MS,
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

test("cold launch is claimed once per session and lasts within the frozen window", () => {
  const gate = createBrandLaunchGate();
  const storage = memoryStorage();

  assert.equal(gate(storage), true);
  assert.equal(gate(storage), false);
  assert.ok(BRAND_LAUNCH_DURATION_MS >= 800);
  assert.ok(BRAND_LAUNCH_DURATION_MS <= 1200);
});

test("a new runtime does not repeat a launch already recorded in session storage", () => {
  const gate = createBrandLaunchGate();
  assert.equal(gate(memoryStorage("1")), false);
});

test("the brand layer is static, exact, and independent from network writes", () => {
  const component = readFileSync("src/components/launch/StaticBrandLaunch.tsx", "utf8");
  const styles = readFileSync("src/components/launch/StaticBrandLaunch.module.css", "utf8");

  assert.match(component, /忆见/);
  assert.match(component, /MEMORYAI/);
  assert.match(component, /让想念的人，继续陪伴。/);
  assert.match(component, /AI形象 · 声音 · 长期记忆/);
  assert.doesNotMatch(component, /fetch\(|button|progress|连接中|人物/);
  assert.doesNotMatch(styles, /animation|transition|@keyframes/);
});
