import assert from "node:assert/strict";
import test from "node:test";

import type { LLMProvider } from "../../services/llm/llm-provider";
import type { Conversation, Message } from "./types";
import {
  FirstGreetingInProgressError,
  FirstGreetingProviderError,
  FirstGreetingService,
} from "./first-greeting-service";

const userId = "owner-1";
const memoryId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "first-greeting-key-0001";
const conversation: Conversation = {
  id: "22222222-2222-4222-8222-222222222222",
  memoryId,
  userId,
  title: "Default",
  summary: null,
  lastMessageAt: null,
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};
const memory = {
  id: memoryId,
  userId,
  name: "Saved relative",
  relationship: "parent",
  lifeStory: "Saved life story only",
  personalityProfile: "用户确认称呼 TA 为：妈妈。",
  speechStyle: "先安慰，再慢慢解释。",
  catchPhrases: "别着急，慢慢来。",
  valuesBelief: null,
  personalityType: null,
};

function message(content: string): Message {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    sessionId: conversation.id,
    memoryId,
    userId,
    role: "assistant",
    content,
    tokens: null,
    metadata: { kind: "first_greeting", idempotencyKey },
    createdAt: "2026-07-22T00:00:01.000Z",
  };
}

function greetingStore() {
  let state: "idle" | "pending" | "completed" | "failed" = "idle";
  let saved: Message | undefined;
  let completions = 0;
  let failures = 0;
  const chat = {
    async claimFirstGreeting() {
      if (state === "completed") return { status: "replayed" as const, conversation, message: saved };
      if (state === "pending") return { status: "in_progress" as const, conversation };
      state = "pending";
      return { status: "claimed" as const, conversation };
    },
    async completeFirstGreeting(input: { content: string }) {
      assert.equal(state, "pending");
      completions += 1;
      saved = message(input.content);
      state = "completed";
      return saved;
    },
    async failFirstGreeting() {
      if (state === "pending") state = "failed";
      failures += 1;
    },
  };
  return {
    chat,
    get state() { return state; },
    get completions() { return completions; },
    get failures() { return failures; },
    get saved() { return saved; },
  };
}

function input() {
  return { userId, memoryId, idempotencyKey, memory };
}

test("first greeting serializes concurrent claims and replays the one saved assistant message", async () => {
  const store = greetingStore();
  let providerCalls = 0;
  let releaseProvider: (() => void) | undefined;
  const provider: LLMProvider = {
    async generate(prompt) {
      providerCalls += 1;
      assert.equal(prompt.messages.length, 1);
      assert.equal(prompt.messages[0].role, "system");
      assert.match(prompt.messages[0].content, /Saved life story only/);
      assert.match(prompt.messages[0].content, /用户确认称呼 TA 为：妈妈/);
      assert.match(prompt.messages[0].content, /先安慰，再慢慢解释/);
      assert.match(prompt.messages[0].content, /别着急，慢慢来/);
      assert.doesNotMatch(prompt.messages[0].content, /user message|用户说/);
      await new Promise<void>((resolve) => { releaseProvider = resolve; });
      return { content: "A saved-profile greeting", finishReason: "stop" };
    },
  };
  const service = new FirstGreetingService(store.chat, provider);

  const first = service.create(input());
  while (!releaseProvider) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(service.create(input()), FirstGreetingInProgressError);
  assert.equal(providerCalls, 1);

  releaseProvider();
  const created = await first;
  assert.equal(created.replayed, false);
  assert.equal(created.message.role, "assistant");
  assert.equal(store.completions, 1);
  assert.equal(store.failures, 0);

  const replay = await service.create(input());
  assert.equal(replay.replayed, true);
  assert.equal(replay.message.id, created.message.id);
  assert.equal(providerCalls, 1);
  assert.equal(store.completions, 1);
});

test("provider failure leaves no assistant message and allows a later claim", async () => {
  const store = greetingStore();
  const provider: LLMProvider = {
    async generate() {
      throw new Error("provider unavailable");
    },
  };
  const service = new FirstGreetingService(store.chat, provider);

  await assert.rejects(service.create(input()), FirstGreetingProviderError);
  assert.equal(store.saved, undefined);
  assert.equal(store.completions, 0);
  assert.equal(store.failures, 1);
  assert.equal(store.state, "failed");
});

test("empty provider output is not persisted as a greeting", async () => {
  const store = greetingStore();
  const provider: LLMProvider = {
    async generate() {
      return { content: "   ", finishReason: "stop" };
    },
  };

  await assert.rejects(
    new FirstGreetingService(store.chat, provider).create(input()),
    FirstGreetingProviderError
  );
  assert.equal(store.completions, 0);
  assert.equal(store.saved, undefined);
});
