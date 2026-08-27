import assert from "node:assert/strict";
import test from "node:test";

import { attachSoundscapeMediaBridge } from "../SoundscapeMediaBridge";

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
  assert.deepEqual(listeners.map((entry) => entry.type), ["play", "playing", "pause", "ended", "visibilitychange"]);
  assert.equal(listeners.slice(0, 4).every((entry) => entry.capture), true);
  detach();
  assert.equal(listeners.length, 0);
});
