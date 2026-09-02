import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

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
  assert.deepEqual(listeners.map((entry) => entry.type), ["play", "playing", "pause", "ended", "volumechange", SOUNDSCAPE_FOREGROUND_AUDIO_EVENT, "visibilitychange"]);
  assert.equal(listeners.slice(0, 5).every((entry) => entry.capture), true);
  detach();
  assert.equal(listeners.length, 0);
});

function mediaDocument(markup: string) {
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`);
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of [
    ["HTMLMediaElement", dom.window.HTMLMediaElement],
    ["HTMLVideoElement", dom.window.HTMLVideoElement],
    ["HTMLAudioElement", dom.window.HTMLAudioElement],
  ] as const) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  const playing = (selector: string) => {
    const media = dom.window.document.querySelector<HTMLMediaElement>(selector);
    assert.ok(media);
    Object.defineProperty(media, "paused", { configurable: true, value: false });
    Object.defineProperty(media, "ended", { configurable: true, value: false });
    return media;
  };
  const close = () => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    dom.window.close();
  };
  return { dom, playing, close };
}

test("initial scan yields to an already-playing audible video", () => {
  const { dom, playing, close } = mediaDocument('<video id="foreground"></video>');
  try {
    const video = playing("#foreground");
    const events: unknown[] = [];
    const detach = attachSoundscapeMediaBridge(dom.window.document, (event) => events.push(event));
    assert.deepEqual(events, [{ type: "video", active: true }]);

    video.muted = true;
    video.dispatchEvent(new dom.window.Event("volumechange", { bubbles: true }));
    assert.deepEqual(events, [{ type: "video", active: true }, { type: "video", active: false }]);
    detach();
  } finally {
    close();
  }
});

test("muted homepage-style video is ignored by initial scan", () => {
  const { dom, playing, close } = mediaDocument('<video id="background" muted></video>');
  try {
    const video = playing("#background");
    video.muted = true;
    const events: unknown[] = [];
    const detach = attachSoundscapeMediaBridge(dom.window.document, (event) => events.push(event));
    assert.deepEqual(events, []);
    detach();
  } finally {
    close();
  }
});

test("explicit encounter priority wins even when its video is muted", () => {
  const { dom, playing, close } = mediaDocument('<video id="encounter" muted data-soundscape-priority="true"></video>');
  try {
    const video = playing("#encounter");
    video.muted = true;
    const events: unknown[] = [];
    const detach = attachSoundscapeMediaBridge(dom.window.document, (event) => events.push(event));
    assert.deepEqual(events, [{ type: "video", active: true }]);
    detach();
  } finally {
    close();
  }
});

test("multiple foreground audio elements are reference-counted", () => {
  const { dom, playing, close } = mediaDocument('<audio id="one"></audio><audio id="two"></audio>');
  try {
    const one = playing("#one");
    const two = playing("#two");
    const events: unknown[] = [];
    const detach = attachSoundscapeMediaBridge(dom.window.document, (event) => events.push(event));
    assert.deepEqual(events, [{ type: "audio", active: true }]);
    one.dispatchEvent(new dom.window.Event("pause", { bubbles: true }));
    assert.deepEqual(events, [{ type: "audio", active: true }]);
    two.dispatchEvent(new dom.window.Event("ended", { bubbles: true }));
    assert.deepEqual(events, [{ type: "audio", active: true }, { type: "audio", active: false }]);
    detach();
  } finally {
    close();
  }
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

