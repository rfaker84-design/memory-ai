import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SOUNDSCAPE_PREFERENCE, readSoundscapePreference, SOUNDSCAPE_PREFERENCE_KEY, withSoundscapeEnabled, withSoundscapeVolume, writeSoundscapePreference } from "../SoundscapePreference";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: (key: string) => key === SOUNDSCAPE_PREFERENCE_KEY ? value : null,
    setItem: (key: string, next: string) => { if (key === SOUNDSCAPE_PREFERENCE_KEY) value = next; },
  };
}

test("missing and malformed local preference fail closed", () => {
  assert.deepEqual(readSoundscapePreference(memoryStorage()), DEFAULT_SOUNDSCAPE_PREFERENCE);
  assert.deepEqual(readSoundscapePreference(memoryStorage("not-json")), DEFAULT_SOUNDSCAPE_PREFERENCE);
  assert.deepEqual(readSoundscapePreference(memoryStorage('{"version":1,"enabled":true,"volume":2}')), DEFAULT_SOUNDSCAPE_PREFERENCE);
});

test("soundscape preference is local, versioned, and volume bounded", () => {
  const storage = memoryStorage();
  const next = withSoundscapeVolume(withSoundscapeEnabled(DEFAULT_SOUNDSCAPE_PREFERENCE, true), 0.9);
  assert.deepEqual(next, { version: 1, enabled: true, volume: 0.35 });
  writeSoundscapePreference(storage, next);
  assert.deepEqual(readSoundscapePreference(storage), next);
});
