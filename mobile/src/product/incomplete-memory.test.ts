import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PickedMedia } from "../native/memory-media";
import type { ProductMemory } from "./api";
import { uploadPendingMedia } from "./creation-flow";
import { classifyOwnedMemories, findIncompleteMemory, resumePendingCreation } from "./incomplete-memory";

const incomplete: ProductMemory = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Synthetic incomplete memory",
  relationship: "family",
  lifeStory: "Synthetic recovery fixture",
  photoAssetId: null,
};

const completed: ProductMemory = {
  ...incomplete,
  id: "22222222-2222-4222-8222-222222222222",
  photoAssetId: "asset-server-confirmed",
};

const photo: PickedMedia = {
  uri: "content://synthetic/valid-png",
  mimeType: "image/png",
  name: "synthetic.png",
};

test("cold-start lists select a server-owned photo-less Memory for completion", () => {
  const state = classifyOwnedMemories([incomplete, completed]);
  assert.equal(state.incomplete?.id, incomplete.id);
  assert.equal(state.active?.id, completed.id);
  assert.equal(findIncompleteMemory([{ ...completed, photoAssetId: "" }])?.id, completed.id);
  assert.equal(findIncompleteMemory([completed, { ...completed, id: "33333333-3333-4333-8333-333333333333" }]), null);
});

test("resuming reuses the original Memory ID and has no create-Memory capability", async () => {
  const pending = resumePendingCreation(incomplete, [photo]);
  const uploadIds: string[] = [];
  const api = {
    async uploadMedia(memoryId: string) {
      uploadIds.push(memoryId);
      return { id: "asset", mediaType: "image" as const, mimeType: "image/png", sizeBytes: 4040, status: "uploaded" as const, createdAt: "2026-07-30T00:00:00.000Z" };
    },
    async createFirstGreeting() { throw new Error("not called"); },
  };

  await uploadPendingMedia(pending, api);
  assert.deepEqual(uploadIds, [incomplete.id]);
  assert.equal("createMemory" in api, false);
  assert.throws(() => resumePendingCreation(completed, [photo]));
});

test("a failed upload can be rehydrated after restart without a greeting or a second TA", async () => {
  const failed = resumePendingCreation(incomplete, [photo]);
  let greetingCalls = 0;
  await assert.rejects(() => uploadPendingMedia(failed, {
    async uploadMedia() { throw new Error("upload failed"); },
    async createFirstGreeting() { greetingCalls += 1; throw new Error("not called"); },
  }));
  assert.equal(greetingCalls, 0);

  const afterRestart = findIncompleteMemory([{ ...incomplete }]);
  const retried = resumePendingCreation(afterRestart!, [photo]);
  assert.equal(retried.memory.id, incomplete.id);
  assert.equal(retried.uploadedMediaUris.length, 0);
});

test("a refreshed DTO with a confirmed photo no longer exposes an incomplete TA", () => {
  assert.equal(findIncompleteMemory([{ ...incomplete, photoAssetId: "asset-server-confirmed" }]), null);
  assert.equal(findIncompleteMemory([completed, { ...completed, id: "33333333-3333-4333-8333-333333333333" }, { ...completed, id: "44444444-4444-4444-8444-444444444444" }]), null);
});

test("App wiring selects incomplete Memories and short-circuits creation during resume", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  assert.match(app, /const \{ incomplete \} = classifyOwnedMemories\(memories\)/);
  assert.match(app, /const restoredMemory = selectPrimaryCompanion\(memories, preference\.value\)/);
  assert.match(app, /const created = resumingMemory\s*\?\? await productApi\.createMemory/);
  assert.match(app, /pending = resumingMemory\s*\? resumePendingCreation\(created, media\)/);
  assert.match(app, /if \(mode !== "preview" && incompleteMemory\) \{\s*continueIncompleteMemory\(\);/);
  assert.match(app, /incompleteMemory \? continueIncompleteMemory\(\)/);
  assert.match(app, /hasIncompleteMemory \? "继续补充照片"/);
  assert.equal((app.match(/setScreen\("create"\)/g) ?? []).length, 1);
  const confirmation = app.indexOf("const confirmedMemory = await productApi.getMemory(uploaded.memory.id);");
  const greeting = app.indexOf("await requestServerGreeting(uploaded, productApi);");
  assert.ok(confirmation >= 0 && greeting > confirmation);
  assert.match(app, /if \(!confirmedMemory\.photoAssetId\?\.trim\(\)\)/);
  assert.doesNotMatch(app, /localStorage|sessionStorage/);
});
