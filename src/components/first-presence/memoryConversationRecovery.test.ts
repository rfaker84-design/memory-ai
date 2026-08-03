import assert from "node:assert/strict";
import test from "node:test";

import type { ConversationMessage } from "./memoryConversationAdapter";
import { hasPersistedPendingConversationMessage } from "./memoryConversationRecovery";

const pending = { content: "我想你了", idempotencyKey: "message-current-0001" };

function userMessage(metadata: Record<string, unknown> | null): ConversationMessage {
  return { id: "message-1", sessionId: "session-1", role: "user", content: pending.content, metadata };
}

test("weak-network recovery never treats an earlier identical sentence as the uncertain write", () => {
  assert.equal(hasPersistedPendingConversationMessage([
    userMessage({ kind: "memory_chat_turn", idempotencyKey: "message-earlier-0001" }),
  ], pending), false);
  assert.equal(hasPersistedPendingConversationMessage([
    userMessage({ kind: "memory_chat_turn", idempotencyKey: pending.idempotencyKey }),
  ], pending), true);
});

test("recovery fails closed when the formal server response omits idempotency metadata", () => {
  assert.equal(hasPersistedPendingConversationMessage([
    userMessage(null),
    userMessage({ kind: "memory_chat_turn" }),
    userMessage({ idempotencyKey: pending.idempotencyKey }),
  ], pending), false);
});
