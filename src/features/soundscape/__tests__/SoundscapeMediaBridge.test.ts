import assert from "node:assert/strict";
import test from "node:test";

import { attachSoundscapeEncounterPhaseBridge, attachSoundscapeMediaBridge, SOUNDSCAPE_FOREGROUND_AUDIO_EVENT } from "../SoundscapeMediaBridge";

test("media bridge is a read-only listener registration", () => {
  const listeners: Array<{ type: string; listener: EventListenerOrEventListenerObject; capture?: boolean }> = [];
  const documentRef = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) { listeners.push({ type, listener, capture: options === true }); },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) {
      const index = listeners.findIndex((entry) => entry.type === type && entry.listener === listener && entry.capture === (options === true));
      if (index >= 0) listeners.splice(index, 1);
    },
  } as unknown as Document;
  const detach = attachSoundscapeMediaBridge(documentRef, () => undefined);
  assert.deepEqual(listeners.map((entry) => entry.type), ["play", "playing", "pause", "ended", SOUNDSCAPE_FOREGROUND_AUDIO_EVENT, "visibilitychange"]);
  assert.equal(listeners.slice(0, 4).every((entry) => entry.capture), true);
  detach();
  assert.equal(listeners.length, 0);
});

test("foreground audio contract is reference-counted and supports TTS and system voice", () => {
  const listeners = new Map<string, EventListener>();
  const documentRef = {
    visibilityState: "visible",
    addEventListener(type: string, listener: EventListener) { listeners.set(type, listener); },
    removeEventListener(type: string) { listeners.delete(type); },
  } as unknown as Document;
  const events: unknown[] = [];
  const detach = attachSoundscapeMediaBridge(documentRef, (event) => events.push(event));
  const foreground = listeners.get(SOUNDSCAPE_FOREGROUND_AUDIO_EVENT);
  assert.ok(foreground);
  foreground?.({ detail: { token: "one", type: "tts", active: true } } as unknown as Event);
  foreground?.({ detail: { token: "two", type: "tts", active: true } } as unknown as Event);
  foreground?.({ detail: { token: "one", type: "tts", active: false } } as unknown as Event);
  foreground?.({ detail: { token: "two", type: "tts", active: false } } as unknown as Event);
  foreground?.({ detail: { token: "system", type: "system_voice", active: true } } as unknown as Event);
  assert.deepEqual(events, [
    { type: "tts", active: true },
    { type: "tts", active: false },
    { type: "system_voice", active: true },
  ]);
  detach();
});

test("encounter adapter accepts only explicit read-only phases", () => {
  const listeners = new Map<string, EventListener>();
  const documentRef = {
    addEventListener(type: string, listener: EventListener) { listeners.set(type, listener); },
    removeEventListener(type: string) { listeners.delete(type); },
  } as unknown as Document;
  const phases: string[] = [];
  const detach = attachSoundscapeEncounterPhaseBridge(documentRef, ({ phase }) => phases.push(phase));
  const listener = [...listeners.values()][0];
  listener?.({ detail: { phase: "preparing" } } as unknown as Event);
  listener?.({ detail: { phase: "guessed-from-timer" } } as unknown as Event);
  listener?.({ detail: { phase: "settling" } } as unknown as Event);
  assert.deepEqual(phases, ["preparing", "settling"]);
  detach();
});
