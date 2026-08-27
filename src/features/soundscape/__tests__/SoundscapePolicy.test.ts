import assert from "node:assert/strict";
import test from "node:test";

import { isSoundscapeFeatureEnabled, resolveSoundscapeRoute } from "../SoundscapePolicy";

test("soundscape policy only maps frozen public routes", () => {
  assert.deepEqual(resolveSoundscapeRoute("/"), { soundscape: "glow", reason: "home" });
  assert.deepEqual(resolveSoundscapeRoute("/companion"), { soundscape: "companion", reason: "companion" });
  assert.deepEqual(resolveSoundscapeRoute("/guest/companion"), { soundscape: "companion", reason: "companion" });
  assert.deepEqual(resolveSoundscapeRoute("/memories"), { soundscape: "stardust", reason: "memories" });
  assert.deepEqual(resolveSoundscapeRoute("/guest/memories"), { soundscape: "stardust", reason: "memories" });
  assert.deepEqual(resolveSoundscapeRoute("/memory"), { soundscape: "stardust", reason: "memories" });
  assert.deepEqual(resolveSoundscapeRoute("/memory/memory-1/encounter"), { soundscape: null, reason: "off-route" });
  assert.deepEqual(resolveSoundscapeRoute("/memory/memory-1/encounter", "preparing"), { soundscape: "reunion", reason: "encounter" });
  assert.deepEqual(resolveSoundscapeRoute("/memory/memory-1/encounter", "settling"), { soundscape: "reunion", reason: "encounter" });
  assert.deepEqual(resolveSoundscapeRoute("/memory-chat/memory-1"), { soundscape: null, reason: "off-route" });
  assert.deepEqual(resolveSoundscapeRoute("/login"), { soundscape: null, reason: "off-route" });
});

test("only exact true enables the build-time soundscape", () => {
  assert.equal(isSoundscapeFeatureEnabled("true"), true);
  assert.equal(isSoundscapeFeatureEnabled("TRUE"), false);
  assert.equal(isSoundscapeFeatureEnabled(" true"), false);
  assert.equal(isSoundscapeFeatureEnabled(undefined), false);
});
