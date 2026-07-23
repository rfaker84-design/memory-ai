import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import type { Conversation, Message } from "../../../features/chat/types";
import type { Memory } from "../../../features/memory/types";
import { createMemoryChatHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "http://localhost";

const memoryId = "11111111-1111-4111-8111-111111111111";
const userId = "final-real-test-owner";
const idempotencyKey = "memory-chat-final-test-key-0001";
const memory: Memory = {
  id: memoryId,
  userId,
  name: "Verified profile",
  relationship: "parent",
  lifeStory: "Verified profile facts only",
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};
const conversation: Conversation = {
  id: "22222222-2222-4222-8222-222222222222",
  memoryId,
  userId,
  title: "Final real test",
  summary: null,
  lastMessageAt: null,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

function request(body: unknown, key = idempotencyKey) {
  return new NextRequest("http://localhost/api/memory-chat", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
}

function createMessage(role: Message["role"], content: string, id: string): Message {
  return {
    id,
    sessionId: conversation.id,
    memoryId,
    userId,
    role,
    content,
    tokens: null,
    metadata: null,
    createdAt: "2026-07-23T00:00:00.000Z",
  };
}

function createTurnStore() {
  let status: "idle" | "pending" | "completed" | "failed" = "idle";
  let result: { conversation: Conversation; userMessage: Message; assistantMessage: Message } | undefined;
  const userMessages: Message[] = [];
  const assistantMessages: Message[] = [];

  return {
    service: {
      async claim() {
        if (status === "completed") return { status: "replayed" as const, conversation, result };
        if (status === "pending") return { status: "in_progress" as const, conversation };
        status = "pending";
        return { status: "claimed" as const, conversation };
      },
      async complete(input: { question: string; answer: string }) {
        assert.equal(status, "pending");
        const userMessage = createMessage("user", input.question, "33333333-3333-4333-8333-333333333333");
        const assistantMessage = createMessage("assistant", input.answer, "44444444-4444-4444-8444-444444444444");
        userMessages.push(userMessage);
        assistantMessages.push(assistantMessage);
        result = { conversation, userMessage, assistantMessage };
        status = "completed";
        return result;
      },
      async fail() {
        if (status === "pending") status = "failed";
      },
    },
    get status() { return status; },
    get userMessages() { return userMessages; },
    get assistantMessages() { return assistantMessages; },
  };
}

function createHandler(store: ReturnType<typeof createTurnStore>, generateReply: () => Promise<{ content: string }>) {
  return createMemoryChatHandler(
    () => ({ async getMemoryForUser(id, owner) { return id === memoryId && owner === userId ? memory : null; } }),
    () => store.service,
    () => ({ async generateReply() { return generateReply(); } }),
    async () => ({ userId: "internal-owner", externalUserId: userId, expiresAt: "2026-07-24T00:00:00.000Z" }),
    async () => false,
    async () => ({ rateAllowed: true, concurrencyAllowed: true })
  );
}

test("memory-chat replays one completed turn without duplicate messages or provider work", async () => {
  const store = createTurnStore();
  let providerCalls = 0;
  const handler = createHandler(store, async () => {
    providerCalls += 1;
    return { content: "Verified reply" };
  });

  const first = await handler(request({ memoryId, question: "A safe question" }));
  const firstBody = await first.json();
  const replay = await handler(request({ memoryId, question: "A safe question" }));

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), firstBody);
  assert.equal(providerCalls, 1);
  assert.equal(store.userMessages.length, 1);
  assert.equal(store.assistantMessages.length, 1);
});

test("memory-chat provider failure leaves no messages and the same key safely retries", async () => {
  const store = createTurnStore();
  let providerCalls = 0;
  const handler = createHandler(store, async () => {
    providerCalls += 1;
    if (providerCalls === 1) throw new Error("fake provider unavailable");
    return { content: "Recovered reply" };
  });

  const failed = await handler(request({ memoryId, question: "Retry-safe question" }));
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "AI_UNAVAILABLE" });
  assert.equal(store.status, "failed");
  assert.equal(store.userMessages.length, 0);
  assert.equal(store.assistantMessages.length, 0);

  const retried = await handler(request({ memoryId, question: "Retry-safe question" }));
  assert.equal(retried.status, 200);
  assert.equal(providerCalls, 2);
  assert.equal(store.status, "completed");
  assert.equal(store.userMessages.length, 1);
  assert.equal(store.assistantMessages.length, 1);
});
