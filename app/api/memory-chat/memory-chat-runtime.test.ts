import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import type { Conversation, Message } from "../../../features/chat/types";
import type { Memory } from "../../../features/memory/types";
import { createMemoryChatHandler } from "./_handler";

process.env.AUTH_ALLOWED_ORIGIN = "http://localhost";

const memoryId = "11111111-1111-4111-8111-111111111111";
const userId = "runtime-owner";
const idempotencyKey = "memory-chat-turn-0001";
const conversation: Conversation = {
  id: "22222222-2222-4222-8222-222222222222",
  memoryId,
  userId,
  title: "Default conversation",
  summary: null,
  lastMessageAt: null,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};
const memory: Memory = {
  id: memoryId,
  userId,
  name: "Saved relative",
  relationship: "parent",
  lifeStory: "Saved profile only",
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};
const userMessage: Message = {
  id: "33333333-3333-4333-8333-333333333333",
  sessionId: conversation.id,
  memoryId,
  userId,
  role: "user",
  content: "Hello",
  tokens: null,
  metadata: null,
  createdAt: "2026-07-23T00:00:01.000Z",
};
const assistantMessage: Message = {
  id: "44444444-4444-4444-8444-444444444444",
  sessionId: conversation.id,
  memoryId,
  userId,
  role: "assistant",
  content: "Saved reply",
  tokens: null,
  metadata: null,
  createdAt: "2026-07-23T00:00:02.000Z",
};
const result = { conversation, userMessage, assistantMessage };
const sessionResolver = async () => ({
  userId: "internal-owner",
  externalUserId: userId,
  expiresAt: "2026-07-24T00:00:00.000Z",
});
const allowAdmission = async () => ({ rateAllowed: true, concurrencyAllowed: true });

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

function createHandler(turnService: {
  claim: (input: { userId: string; memoryId: string; idempotencyKey: string; question: string }) => Promise<unknown>;
  complete: (input: unknown) => Promise<unknown>;
  fail: (input: unknown) => Promise<void>;
}, generateReply: () => Promise<{ content: string }> = async () => ({ content: assistantMessage.content })) {
  return createMemoryChatHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => turnService as never,
    () => ({ async generateReply() { return generateReply(); } }),
    sessionResolver,
    async () => true,
    allowAdmission,
    undefined,
    () => true
  );
}

test("memory-chat handler completes a fully injected turn without Supabase, database, or AI access", async () => {
  let providerCalls = 0;
  let completeCalls = 0;
  let persistedCalls = 0;
  const handler = createMemoryChatHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({
      async claim() { return { status: "claimed" as const, conversation }; },
      async complete() { completeCalls += 1; return result; },
      async fail() { throw new Error("fail should not run"); },
    }),
    () => ({ async generateReply() { providerCalls += 1; return { content: assistantMessage.content }; } }),
    sessionResolver,
    async () => { persistedCalls += 1; return true; },
    allowAdmission,
    undefined,
    () => true
  );

  const response = await handler(request({ memoryId, question: "Hello" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    answer: assistantMessage.content,
    reply: assistantMessage.content,
    text: assistantMessage.content,
    sessionId: conversation.id,
  });
  assert.equal(providerCalls, 1);
  assert.equal(completeCalls, 1);
  assert.equal(persistedCalls, 1);
});

test("memory-chat replay does not call the provider or persist a duplicate long-term memory", async () => {
  let providerCalls = 0;
  let persistedCalls = 0;
  const handler = createMemoryChatHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({
      async claim() { return { status: "replayed" as const, conversation, result }; },
      async complete() { throw new Error("complete should not run for a replay"); },
      async fail() { throw new Error("fail should not run for a replay"); },
    }),
    () => ({ async generateReply() { providerCalls += 1; return { content: "unexpected" }; } }),
    sessionResolver,
    async () => { persistedCalls += 1; return true; },
    allowAdmission,
    undefined,
    () => true
  );

  const response = await handler(request({ memoryId, question: "Hello" }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).answer, assistantMessage.content);
  assert.equal(providerCalls, 0);
  assert.equal(persistedCalls, 0);
});

test("memory-chat provider failures leave no messages and the same key can retry", async () => {
  let claimCalls = 0;
  let providerCalls = 0;
  let completeCalls = 0;
  let failCalls = 0;
  const handler = createHandler(
    {
      async claim() {
        claimCalls += 1;
        return { status: "claimed" as const, conversation };
      },
      async complete() { completeCalls += 1; return result; },
      async fail() { failCalls += 1; },
    },
    async () => {
      providerCalls += 1;
      if (providerCalls === 1) throw new Error("provider unavailable");
      return { content: assistantMessage.content };
    }
  );

  const failed = await handler(request({ memoryId, question: "Hello" }));
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "AI_UNAVAILABLE" });
  const retried = await handler(request({ memoryId, question: "Hello" }));
  assert.equal(retried.status, 200);
  assert.equal(claimCalls, 2);
  assert.equal(providerCalls, 2);
  assert.equal(failCalls, 1);
  assert.equal(completeCalls, 1);
});

test("memory-chat rejects an unsafe engine response before it can be persisted", async () => {
  let completeCalls = 0;
  let failCalls = 0;
  const handler = createHandler(
    {
      async claim() { return { status: "claimed" as const, conversation }; },
      async complete() { completeCalls += 1; return result; },
      async fail() { failCalls += 1; },
    },
    async () => ({ content: "我是Saved relative，我已经复活。" })
  );

  const response = await handler(request({ memoryId, question: "Hello" }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "AI_UNAVAILABLE" });
  assert.equal(completeCalls, 0);
  assert.equal(failCalls, 1);
});

test("memory-chat validates Unicode length and dangerous question content before service work", async () => {
  let serviceCalls = 0;
  const handler = createMemoryChatHandler(
    () => ({ async getMemoryForUser() { serviceCalls += 1; return memory; } }),
    () => ({
      async claim() { throw new Error("claim should not run"); },
      async complete() { throw new Error("complete should not run"); },
      async fail() { throw new Error("fail should not run"); },
    }),
    () => ({ async generateReply() { throw new Error("provider should not run"); } }),
    sessionResolver,
    async () => true,
    allowAdmission,
    undefined,
    () => true
  );
  const invalidBodies = [
    { memoryId, question: "   " },
    { memoryId, question: "a".repeat(4_001) },
    { memoryId, question: "<script>alert(1)</script>" },
    { memoryId, question: "<img src=x onerror=alert(1)>" },
    { memoryId, question: "onload=alert(1)" },
    { memoryId, question: "javascript:alert(1)" },
    { memoryId, question: "Hello", history: [] },
    { memoryId, question: "Hello", message: "forged" },
    { memoryId, question: "Hello", userId: "forged" },
    { memoryId, question: "Hello", relativeId: "forged" },
    { memoryId, question: "Hello", requestId: "forged" },
  ];
  for (const body of invalidBodies) {
    const response = await handler(request(body));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "INVALID_REQUEST" });
  }
  assert.equal(serviceCalls, 0);

  const safeHandler = createHandler({
    async claim() { return { status: "in_progress" as const, conversation }; },
    async complete() { throw new Error("complete should not run"); },
    async fail() { throw new Error("fail should not run"); },
  });
  const safe = await safeHandler(request({ memoryId, question: `<3 ${"😀".repeat(3_997)}` }));
  assert.equal(safe.status, 409);
  assert.deepEqual(await safe.json(), { error: "CHAT_TURN_IN_PROGRESS" });

  const singleCharacter = await safeHandler(request({ memoryId, question: "x" }));
  assert.equal(singleCharacter.status, 409);
  assert.deepEqual(await singleCharacter.json(), { error: "CHAT_TURN_IN_PROGRESS" });
});
