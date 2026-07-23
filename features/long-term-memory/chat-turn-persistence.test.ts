import assert from "node:assert/strict";
import test from "node:test";

import type { Message } from "../chat";
import { persistChatTurnLongTermMemory } from "./chat-turn-persistence";
import { MemoryExtractor } from "./memory-extractor";

const memoryId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const userId = "owner";
const message = (role: Message["role"], content: string, id: string): Message => ({
  id,
  sessionId,
  memoryId,
  userId,
  role,
  content,
  tokens: null,
  metadata: null,
  createdAt: "2026-07-23T00:00:00.000Z",
});

test("MemoryExtractor distinguishes rememberable and ordinary complete turns", () => {
  const extractor = new MemoryExtractor();
  assert.equal(extractor.extract({
    userId,
    memoryId,
    sessionId,
    userMessage: "我记得小时候一起去学校",
    assistantMessage: "我听见了",
  }).shouldRemember, true);
  assert.equal(extractor.extract({
    userId,
    memoryId,
    sessionId,
    userMessage: "今天天气不错",
    assistantMessage: "是的",
  }).shouldRemember, false);
});

test("chat-turn persistence writes the user message only when extractor remembers", async () => {
  const writes: unknown[] = [];
  const saved = await persistChatTurnLongTermMemory({
    service: { async createMemory(input) { writes.push(input); return {} as never; } },
    extractor: { extract() { return { shouldRemember: true, content: "remember this", importance: 60, tags: ["chat"] }; } },
    externalUserId: userId,
    memoryId,
    sessionId,
    userMessage: message("user", "我记得小时候", "33333333-3333-4333-8333-333333333333"),
    assistantMessage: message("assistant", "我听见了", "44444444-4444-4444-8444-444444444444"),
  });
  assert.equal(saved, true);
  assert.deepEqual(writes, [{
    externalUserId: userId,
    memoryId,
    content: "remember this",
    sourceType: "chat_user_message",
    sourceId: "33333333-3333-4333-8333-333333333333",
    importance: 60,
    tags: ["chat"],
    metadata: { sessionId },
  }]);
});

test("chat-turn persistence does not write when extractor declines", async () => {
  let writes = 0;
  const saved = await persistChatTurnLongTermMemory({
    service: { async createMemory() { writes += 1; return {} as never; } },
    extractor: { extract() { return { shouldRemember: false, importance: 0, tags: [] }; } },
    externalUserId: userId,
    memoryId,
    sessionId,
    userMessage: message("user", "普通消息", "33333333-3333-4333-8333-333333333333"),
    assistantMessage: message("assistant", "普通回复", "44444444-4444-8444-444444444444"),
  });
  assert.equal(saved, false);
  assert.equal(writes, 0);
});
