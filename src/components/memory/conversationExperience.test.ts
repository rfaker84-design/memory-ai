import assert from "node:assert/strict";
import test from "node:test";

import {
  completedConversationRounds,
  hasPersistedFirstGreeting,
  type PersistedConversationMessage,
} from "./conversationExperience";

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
  kind: "first_greeting" | "memory_chat_turn",
  key: string,
  sessionId = "session-1",
): PersistedConversationMessage {
  return {
    id,
    sessionId,
    role,
    content,
    metadata: { kind, idempotencyKey: key },
  };
}

const greeting = message("greeting", "assistant", "你回来了。", "first_greeting", "greeting-key");
const userOne = message("user-1", "user", "第一句话", "memory_chat_turn", "turn-1");
const replyOne = message("reply-1", "assistant", "第一句回应", "memory_chat_turn", "turn-1");
const userTwo = message("user-2", "user", "第二句话", "memory_chat_turn", "turn-2");
const replyTwo = message("reply-2", "assistant", "第二句回应", "memory_chat_turn", "turn-2");

test("first greeting and incomplete turns do not unlock the experience", () => {
  assert.equal(hasPersistedFirstGreeting([greeting]), true);
  assert.equal(completedConversationRounds([greeting]), 0);
  assert.equal(completedConversationRounds([greeting, userOne]), 0);
  assert.equal(completedConversationRounds([greeting, userOne, replyOne]), 1);
  assert.equal(completedConversationRounds([greeting, userOne, replyOne, userTwo]), 1);
  assert.equal(completedConversationRounds([greeting, userOne, replyOne, userTwo, replyTwo]), 2);
});

test("blank, failed-shape and preview messages never count", () => {
  const blankReply = message("blank", "assistant", " \n ", "memory_chat_turn", "turn-1");
  const previewReply: PersistedConversationMessage = {
    role: "assistant",
    content: "页面里的示例回应",
  };
  const errorReply: PersistedConversationMessage = {
    id: "error",
    sessionId: "session-1",
    role: "assistant",
    content: "连接失败",
    metadata: { kind: "error", idempotencyKey: "turn-1" },
  };

  assert.equal(completedConversationRounds([greeting, userOne, blankReply]), 0);
  assert.equal(completedConversationRounds([greeting, userOne, previewReply]), 0);
  assert.equal(completedConversationRounds([greeting, userOne, errorReply]), 0);
});

test("a reply must follow its user message in the same persisted session and turn", () => {
  const wrongSessionReply = message(
    "wrong-session",
    "assistant",
    "不属于同一会话",
    "memory_chat_turn",
    "turn-1",
    "session-2",
  );
  const wrongTurnReply = message(
    "wrong-turn",
    "assistant",
    "不属于同一轮",
    "memory_chat_turn",
    "turn-other",
  );

  assert.equal(completedConversationRounds([greeting, replyOne, userOne]), 0);
  assert.equal(completedConversationRounds([greeting, userOne, wrongSessionReply]), 0);
  assert.equal(completedConversationRounds([greeting, userOne, wrongTurnReply]), 0);
});
