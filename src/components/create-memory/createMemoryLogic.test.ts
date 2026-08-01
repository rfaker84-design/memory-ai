import assert from "node:assert/strict";
import test from "node:test";
import { canEnterConversation, completion, creationCompletionStatus, createMemoryRequestHeaders, draftForStorage, validateStage } from "./createMemoryLogic";
import { emptyDraft } from "./types";

test("four-stage validation keeps memory optional", () => {
  const identity = { ...emptyDraft, name: "阿念", relationship: "家人", preferredAddress: "妈妈", purpose: "保存记忆" };
  assert.equal(validateStage(0, identity), null);
  assert.equal(validateStage(1, identity), null);
  assert.equal(validateStage(2, identity), "consent-required");
  assert.equal(validateStage(2, { ...identity, consent: true }), null);
  assert.equal(validateStage(3, identity), null);
});

test("identity required fields reject blank input", () => assert.equal(validateStage(0, emptyDraft), "identity-required"));

test("stored draft excludes transient authorization and all file fields", () => {
  const stored = draftForStorage({ ...emptyDraft, consent: true, name: "阿念" });
  assert.equal("consent" in stored, false);
  assert.deepEqual(Object.keys(stored).includes("photo"), false);
  assert.equal(stored.name, "阿念");
});

test("completion is deterministic and never invents blank facts", () => {
  assert.equal(completion(emptyDraft), 0);
  assert.equal(completion({ ...emptyDraft, name: "阿念" }), 11);
  assert.equal(createMemoryRequestHeaders("memory-1234567890")["Idempotency-Key"], "memory-1234567890");
  assert.throws(() => createMemoryRequestHeaders("short"));
});

test("an unconfirmed media upload never becomes a local creation success", () => {
  assert.equal(creationCompletionStatus(true), "success");
  assert.equal(creationCompletionStatus(false), "media-recovery");
  assert.equal(canEnterConversation("success"), true);
  assert.equal(canEnterConversation("media-recovery"), false);
});
