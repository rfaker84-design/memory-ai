import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import type { Conversation, Message } from "../../../features/chat/types";
import type { Memory } from "../../../features/memory/types";
import { CRISIS_RESPONSE } from "../../../features/memory-engine/crisis-response";
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

test("memory-chat handler completes a fully injected turn without automatically persisting ordinary chat as long-term memory", async () => {
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
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("vary"), "Cookie, Origin");
  assert.deepEqual(await response.json(), {
    answer: assistantMessage.content,
    reply: assistantMessage.content,
    text: assistantMessage.content,
    sessionId: conversation.id,
  });
  assert.equal(providerCalls, 1);
  assert.equal(completeCalls, 1);
  assert.equal(persistedCalls, 0);
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

test("memory-chat returns a non-cacheable rejection before any work when the Session is missing", async () => {
  let memoryReads = 0;
  const handler = createMemoryChatHandler(
    () => ({ async getMemoryForUser() { memoryReads += 1; return memory; } }),
    () => ({ async claim() { throw new Error("must not claim"); }, async complete() { throw new Error("must not complete"); }, async fail() { throw new Error("must not fail"); } }) as never,
    () => ({ async generateReply() { throw new Error("must not generate"); } }),
    async () => null,
  );
  const response = await handler(request({ memoryId, question: "Hello" }));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("vary"), "Cookie, Origin");
  assert.deepEqual(await response.json(), { error: "UNAUTHENTICATED" });
  assert.equal(memoryReads, 0);
});

test("memory-chat rejects a session without server-recorded adult and profile authorization before it claims a turn", async () => {
  let memoryReads = 0;
  const handler = createMemoryChatHandler(
    () => ({ async getMemoryForUser() { memoryReads += 1; return memory; } }),
    () => ({ async claim() { throw new Error("must not claim"); }, async complete() { throw new Error("must not complete"); }, async fail() { throw new Error("must not fail"); } }) as never,
    () => ({ async generateReply() { throw new Error("must not generate"); } }),
    sessionResolver,
    undefined,
    allowAdmission,
    undefined,
    undefined,
    undefined,
    async () => false,
  );
  const response = await handler(request({ memoryId, question: "Hello" }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "ADULT_ELIGIBILITY_REQUIRED" });
  assert.equal(memoryReads, 0);
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

test("memory-chat short-circuits immediate crisis language without a role-model call or durable memory write", async () => {
  let providerCalls = 0;
  let persistedCalls = 0;
  let quotaReservations = 0;
  let releasedQuota = 0;
  let admissionCalls = 0;
  let completedAnswer = "";
  let escalation: unknown;
  const handler = createMemoryChatHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({
      async claim() { return { status: "claimed" as const, conversation }; },
      async complete(input: { answer: string }) {
        completedAnswer = input.answer;
        return { ...result, assistantMessage: { ...assistantMessage, content: input.answer } };
      },
      async fail() { throw new Error("fail should not run"); },
    }),
    () => ({ async generateReply() { providerCalls += 1; return { content: "unexpected" }; } }),
    sessionResolver,
    async () => { persistedCalls += 1; return true; },
    async () => {
      admissionCalls += 1;
      return { rateAllowed: false, concurrencyAllowed: false };
    },
    () => ({
      async reserveChatQuota() { quotaReservations += 1; return "reserved" as const; },
      async releaseChatQuota() { releasedQuota += 1; },
    }),
    () => true,
    async (input) => { escalation = input; return true; },
    async () => true,
    () => ({
      async reserve() { throw new Error("crisis must not reserve a daily admission"); },
      async commit() { throw new Error("crisis must not commit a daily admission"); },
      async release() { throw new Error("crisis must not release a daily admission"); },
    }),
  );

  const response = await handler(request({ memoryId, question: "我不想活了" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    answer: CRISIS_RESPONSE,
    reply: CRISIS_RESPONSE,
    text: CRISIS_RESPONSE,
    sessionId: conversation.id,
  });
  assert.equal(completedAnswer, CRISIS_RESPONSE);
  assert.equal(providerCalls, 0);
  assert.equal(persistedCalls, 0);
  assert.equal(quotaReservations, 0);
  assert.equal(releasedQuota, 0);
  assert.equal(admissionCalls, 0);
  assert.deepEqual(escalation, { userId: "internal-owner", externalUserId: userId, memoryId, idempotencyKey: "memory-chat-turn-0001" });
});

test("memory-chat admission fallbacks remain platform messages and never impersonate the TA", async () => {
  for (const [admission, expected] of [
    [{ concurrencyAllowed: false }, "忆见正在处理上一条请求，请稍后重试。"],
  ] as const) {
    let providerCalls = 0;
    let failedCalls = 0;
    const handler = createMemoryChatHandler(
      () => ({ async getMemoryForUser() { return memory; } }),
      () => ({
        async claim() { return { status: "claimed" as const, conversation }; },
        async complete() { throw new Error("complete should not run"); },
        async fail() { failedCalls += 1; },
      }),
      () => ({ async generateReply() { providerCalls += 1; return { content: "unexpected" }; } }),
      sessionResolver,
      async () => false,
      async () => admission,
      undefined,
      () => false,
    );

    const response = await handler(request({ memoryId, question: "Hello" }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { answer: expected, reply: expected, text: expected });
    assert.equal(providerCalls, 0);
    assert.equal(failedCalls, 1);
    assert.doesNotMatch(expected, /TA|再见|马上就好/);
  }
});

test("ordinary chat releases no Provider work when its durable daily admission is full", async () => {
  let providerCalls = 0;
  let failedCalls = 0;
  let dailyReservations = 0;
  const handler = createMemoryChatHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({
      async claim() { return { status: "claimed" as const, conversation }; },
      async complete() { throw new Error("complete should not run"); },
      async fail() { failedCalls += 1; },
    }),
    () => ({ async generateReply() { providerCalls += 1; return { content: "unexpected" }; } }),
    sessionResolver,
    async () => false,
    allowAdmission,
    undefined,
    () => false,
    async () => false,
    async () => true,
    () => ({
      async reserve() { dailyReservations += 1; return { status: "limit_reached" as const }; },
      async commit() { throw new Error("commit should not run"); },
      async release() { throw new Error("release should not run"); },
    }),
  );

  const response = await handler(request({ memoryId, question: "Hello" }));
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "FREE_CHAT_DAILY_LIMIT_REACHED" });
  assert.equal(dailyReservations, 1);
  assert.equal(providerCalls, 0);
  assert.equal(failedCalls, 1);
});

test("ordinary chat commits its durable admission and returns one neutral near-limit warning", async () => {
  let committed = 0;
  const handler = createMemoryChatHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({
      async claim() { return { status: "claimed" as const, conversation }; },
      async complete() { return result; },
      async fail() { throw new Error("fail should not run"); },
    }),
    () => ({ async generateReply() { return { content: assistantMessage.content }; } }),
    sessionResolver,
    async () => false,
    allowAdmission,
    undefined,
    () => false,
    async () => false,
    async () => true,
    () => ({
      async reserve() { return { status: "admitted" as const, remaining: 1 }; },
      async commit() { committed += 1; },
      async release() { throw new Error("release should not run"); },
    }),
  );

  const response = await handler(request({ memoryId, question: "Hello" }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).freeChatWarning, true);
  assert.equal(committed, 1);
});

test("ordinary chat releases its durable admission when Provider work fails", async () => {
  let released = 0;
  const handler = createMemoryChatHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({
      async claim() { return { status: "claimed" as const, conversation }; },
      async complete() { throw new Error("complete should not run"); },
      async fail() {},
    }),
    () => ({ async generateReply() { throw new Error("provider unavailable"); } }),
    sessionResolver,
    async () => false,
    allowAdmission,
    undefined,
    () => false,
    async () => false,
    async () => true,
    () => ({
      async reserve() { return { status: "admitted" as const, remaining: 2 }; },
      async commit() { throw new Error("commit should not run"); },
      async release() { released += 1; },
    }),
  );

  const response = await handler(request({ memoryId, question: "Hello" }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "AI_UNAVAILABLE" });
  assert.equal(released, 1);
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
