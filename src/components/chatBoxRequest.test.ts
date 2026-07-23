import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChatBoxMemoryChatRequest,
  chatSessionConfirmsPendingMessage,
  clearPendingChatBoxMessage,
  createChatBoxIdempotencyKey,
  hasChatBoxMemoryId,
  preparePendingChatBoxMessage,
  retainPendingChatBoxMessage,
} from "./chatBoxRequest";

test("ChatBox accepts only a non-empty memory id", () => {
  assert.equal(hasChatBoxMemoryId("memory-1"), true);
  assert.equal(hasChatBoxMemoryId(""), false);
  assert.equal(hasChatBoxMemoryId("   "), false);
  assert.equal(hasChatBoxMemoryId(undefined), false);
});

test("ChatBox generates a distinct, bounded idempotency key for each message", () => {
  const first = createChatBoxIdempotencyKey();
  const second = createChatBoxIdempotencyKey();
  assert.notEqual(first, second);
  assert.match(first, /^chatbox-/);
  assert.ok(first.length >= 16 && first.length <= 128);
});

test("ChatBox sends only the formal memory-chat body and puts the key in the header", () => {
  const request = buildChatBoxMemoryChatRequest("memory-1", "message", "chatbox-message-1");
  assert.equal(request.method, "POST");
  assert.equal(new Headers(request.headers).get("Idempotency-Key"), "chatbox-message-1");
  assert.equal(request.credentials, "same-origin");
  assert.deepEqual(JSON.parse(String(request.body)), {
    memoryId: "memory-1",
    question: "message",
  });
});

test("first send creates a pending message key", () => {
  const pending = preparePendingChatBoxMessage(null, "memory-1", "first message");
  assert.equal(pending.memoryId, "memory-1");
  assert.equal(pending.question, "first message");
  assert.match(pending.idempotencyKey, /^chatbox-/);
});

test("network failure retains the same pending message key", () => {
  const pending = preparePendingChatBoxMessage(null, "memory-1", "first message");
  assert.equal(retainPendingChatBoxMessage(pending), pending);
});

test("explicit retry of the same message reuses its key", () => {
  const pending = preparePendingChatBoxMessage(null, "memory-1", "first message");
  const retry = preparePendingChatBoxMessage(pending, "memory-1", "first message");
  assert.equal(retry, pending);
  assert.equal(retry.idempotencyKey, pending.idempotencyKey);
});

test("edited text or a different memory creates a new pending key", () => {
  const pending = preparePendingChatBoxMessage(null, "memory-1", "first message");
  const edited = preparePendingChatBoxMessage(pending, "memory-1", "edited message");
  const switchedMemory = preparePendingChatBoxMessage(pending, "memory-2", "first message");
  assert.notEqual(edited.idempotencyKey, pending.idempotencyKey);
  assert.notEqual(switchedMemory.idempotencyKey, pending.idempotencyKey);
});

test("successful response or session confirmation clears the pending key", () => {
  const pending = preparePendingChatBoxMessage(null, "memory-1", "first message");
  assert.equal(clearPendingChatBoxMessage(), null);
  assert.equal(chatSessionConfirmsPendingMessage([
    { memoryId: "memory-1", role: "user", content: "first message" },
  ], pending), true);
});
