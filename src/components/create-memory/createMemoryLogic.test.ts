import assert from "node:assert/strict";
import test from "node:test";
import { canEnterConversation, completion, creationCompletionStatus, createMemoryRequestHeaders, draftForStorage, validateStage } from "./createMemoryLogic";
import { emptyDraft } from "./types";

test("two-stage creation asks only for identity first and consent before creation", () => {
  const identity = { ...emptyDraft, name: "阿念", relationship: "父母" };
  assert.equal(validateStage(0, identity), null);
  assert.equal(validateStage(1, identity), "consent-required");
  assert.equal(validateStage(1, { ...identity, consent: true }), null);
});

test("birth date is not part of the creation step state machine", () => {
  assert.equal(validateStage(0, emptyDraft), "identity-required");
  assert.equal(completion(emptyDraft), 0);
  assert.equal(completion({ ...emptyDraft, name: "阿念" }), 25);
});

test("stored draft excludes transient consent and requests retain idempotency", () => {
  const stored = draftForStorage({ ...emptyDraft, consent: true, name: "阿念" });
  assert.equal("consent" in stored, false);
  assert.equal(createMemoryRequestHeaders("memory-1234567890")["Idempotency-Key"], "memory-1234567890");
  assert.throws(() => createMemoryRequestHeaders("short"));
  assert.equal(creationCompletionStatus(true), "success");
  assert.equal(creationCompletionStatus(false), "media-recovery");
  assert.equal(canEnterConversation("success"), true);
});
