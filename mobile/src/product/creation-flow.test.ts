import assert from "node:assert/strict";
import test from "node:test";

import type { PickedMedia } from "../native/memory-media";
import type { FirstGreeting, ProductMemory } from "./api";
import {
  CreationFlowError,
  requestServerGreeting,
  startPendingCreation,
  uploadPendingMedia,
} from "./creation-flow";

const memory: ProductMemory = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test person",
  relationship: "family",
  lifeStory: "Synthetic test memory",
};

const photo: PickedMedia = {
  uri: "content://test/photo",
  mimeType: "image/png",
  name: "photo.png",
};

const greeting: FirstGreeting = {
  session: { id: "22222222-2222-4222-8222-222222222222", memoryId: memory.id, userId: "owner" },
  greeting: {
    id: "33333333-3333-4333-8333-333333333333",
    sessionId: "22222222-2222-4222-8222-222222222222",
    memoryId: memory.id,
    role: "assistant",
    content: "A persisted greeting",
    createdAt: "2026-07-29T00:00:00.000Z",
  },
  replayed: false,
};

test("a remote creation accepts only photos, including when a photo is selected", () => {
  assert.throws(
    () => startPendingCreation(memory, [{ ...photo, mimeType: "audio/wav", uri: "content://test/audio" }]),
    CreationFlowError,
  );
  assert.throws(
    () => startPendingCreation(memory, [photo, { ...photo, mimeType: "audio/wav", uri: "content://test/audio" }]),
    CreationFlowError,
  );
});

test("uploads finish before the formal server greeting and retain retry progress", async () => {
  const calls: string[] = [];
  const updates: number[] = [];
  const pending = startPendingCreation(memory, [photo, { ...photo, uri: "content://test/second-photo", name: "second-photo.png" }]);
  const api = {
    async uploadMedia(memoryId: string, item: PickedMedia) {
      calls.push(`upload:${memoryId}:${item.uri}`);
      return { id: item.uri, mediaType: "image" as const, mimeType: item.mimeType, sizeBytes: 1, status: "uploaded" as const, createdAt: "2026-07-29T00:00:00.000Z" };
    },
    async createFirstGreeting(memoryId: string, key: string) {
      calls.push(`greeting:${memoryId}:${key.length > 16}`);
      return greeting;
    },
  };
  const uploaded = await uploadPendingMedia(pending, api, (next) => updates.push(next.uploadedMediaUris.length));
  const result = await requestServerGreeting(uploaded, api);
  assert.deepEqual(updates, [1, 2]);
  assert.equal(calls.filter((call) => call.startsWith("upload:")).length, 2);
  assert.match(calls[2], /^greeting:/);
  assert.equal(result.greeting.content, greeting.greeting.content);
});

test("a legacy pending creation with audio cannot resume its upload", async () => {
  const unsafePending = {
    ...startPendingCreation(memory, [photo]),
    media: [photo, { ...photo, mimeType: "audio/wav", uri: "content://test/legacy-audio", name: "legacy.wav" }],
  };
  let uploadCalls = 0;
  await assert.rejects(
    () => uploadPendingMedia(unsafePending, {
      async uploadMedia() { uploadCalls += 1; throw new Error("not called"); },
      async createFirstGreeting() { throw new Error("not called"); },
    }),
    CreationFlowError,
  );
  assert.equal(uploadCalls, 0);
});

test("a failed upload does not request a greeting and preserves the persisted retry state", async () => {
  const pending = startPendingCreation(memory, [photo]);
  let greetingCalls = 0;
  const api = {
    async uploadMedia() { throw new Error("upload failed"); },
    async createFirstGreeting() { greetingCalls += 1; return greeting; },
  };
  await assert.rejects(() => uploadPendingMedia(pending, api));
  assert.equal(greetingCalls, 0);
  assert.equal(pending.uploadedMediaUris.length, 0);
});

test("a malformed server greeting cannot advance to local success", async () => {
  const pending = { ...startPendingCreation(memory, [photo]), uploadedMediaUris: [photo.uri] };
  await assert.rejects(
    () => requestServerGreeting(pending, {
      async uploadMedia() { throw new Error("not called"); },
      async createFirstGreeting() {
        return { ...greeting, greeting: { ...greeting.greeting, content: "", memoryId: "foreign" } };
      },
    }),
    CreationFlowError,
  );
});
