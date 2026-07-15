import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { NextRequest } from "next/server";

import type { Conversation, Message } from "../../../features/chat/types";
import type { Memory } from "../../../features/memory/types";
import { createChatSessionHandler } from "./[id]/chat-session/_handler";

const memoryId = "11111111-1111-4111-8111-111111111111";
const userId = "synthetic-owner";
process.env.AUTH_ALLOWED_ORIGIN = "http://localhost";
const sessionResolver = (externalUserId = userId) => async () => ({
  userId: `internal-${externalUserId}`,
  externalUserId,
  expiresAt: "2026-07-16T00:00:00.000Z",
});
const memory: Memory = {
  id: memoryId,
  userId,
  name: "Synthetic memory",
  relationship: "test",
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};
const session: Conversation = {
  id: "22222222-2222-4222-8222-222222222222",
  memoryId,
  userId,
  title: "默认会话",
  summary: null,
  lastMessageAt: null,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};
const messages: Message[] = [{
  id: "33333333-3333-4333-8333-333333333333",
  sessionId: session.id,
  memoryId,
  userId,
  role: "assistant",
  content: "Synthetic response",
  tokens: null,
  metadata: null,
  createdAt: "2026-07-15T00:00:01.000Z",
}];

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/memories/${memoryId}/chat-session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: memoryId }) };

test("chat session returns PostgreSQL conversation messages after owned Memory validation", async () => {
  const ownershipCalls: string[][] = [];
  const chatCalls: string[][] = [];
  const handler = createChatSessionHandler(
    () => ({
      async getMemoryForUser(id, owner) {
        ownershipCalls.push([id, owner]);
        return id === memoryId && owner === userId ? memory : null;
      },
    }),
    () => ({
      async getOrCreateConversationByMemory(owner, id) {
        chatCalls.push([owner, id]);
        return session;
      },
      async listMessages(conversationId) {
        assert.equal(conversationId, session.id);
        return messages;
      },
    }),
    sessionResolver()
  );
  const response = await handler(request({}), context);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { session, messages });
  assert.deepEqual(ownershipCalls, [[memoryId, userId]]);
  assert.deepEqual(chatCalls, [[userId, memoryId]]);
});

test("chat session hides ownership mismatch and does not open a conversation", async () => {
  let chatCalled = false;
  const handler = createChatSessionHandler(
    () => ({ async getMemoryForUser() { return null; } }),
    () => ({
      async getOrCreateConversationByMemory() {
        chatCalled = true;
        return session;
      },
      async listMessages() { return messages; },
    }),
    sessionResolver("another-user")
  );
  const response = await handler(request({}), context);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "MEMORY_NOT_FOUND" });
  assert.equal(chatCalled, false);
});

test("chat session requires a session and rejects a forged userId", async () => {
  const handler = createChatSessionHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({
      async getOrCreateConversationByMemory() { return session; },
      async listMessages() { return messages; },
    }),
    async () => null
  );
  const response = await handler(request({}), context);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "UNAUTHENTICATED");

  const forgedHandler = createChatSessionHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({
      async getOrCreateConversationByMemory() { return session; },
      async listMessages() { return messages; },
    }),
    sessionResolver()
  );
  const forged = await forgedHandler(request({ userId: "another-user" }), context);
  assert.equal(forged.status, 403);
  assert.equal((await forged.json()).error, "SESSION_USER_MISMATCH");
});

test("chat session route preserves frozen PostgreSQL layers", () => {
  const source = readFileSync(
    new URL("./[id]/chat-session/_handler.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /MemoryService/);
  assert.match(source, /MemoryPostgresDataSource/);
  assert.match(source, /ChatService/);
  assert.match(source, /ChatPostgresDataSource/);
  assert.doesNotMatch(source.toLowerCase(), /supabase|memories-mvp/);
  assert.doesNotMatch(source, /SELECT |INSERT |UPDATE |DELETE FROM/);
});
