import assert from "node:assert/strict";
import test from "node:test";

import { adjacentSoundscape, SOUNDSCAPE_PLAYER_LABELS } from "../SoundscapePlayer";

test("the miniature player cycles all procedural soundscapes in both directions", () => {
  assert.equal(adjacentSoundscape("glow", 1), "companion");
  assert.equal(adjacentSoundscape("companion", 1), "stardust");
  assert.equal(adjacentSoundscape("stardust", 1), "reunion");
  assert.equal(adjacentSoundscape("reunion", 1), "glow");
  assert.equal(adjacentSoundscape("glow", -1), "reunion");
});

test("the player exposes stable Chinese soundscape labels", () => {
  assert.deepEqual(SOUNDSCAPE_PLAYER_LABELS, {
    glow: "晨光",
    companion: "相伴",
    stardust: "星河",
    reunion: "重逢",
  });
});
