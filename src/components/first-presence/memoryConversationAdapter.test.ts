import assert from "node:assert/strict";
import test from "node:test";

import {
  completedConversationRounds,
  loadConversation,
  requestFirstGreeting,
  sendConversationMessage,
} from "./memoryConversationAdapter";

test("purchase eligibility counts only two persisted user and assistant exchanges after greeting", () => {
  const greeting = { id: "g", role: "assistant" as const, content: "问候" };
  const firstUser = { id: "u1", role: "user" as const, content: "第一句" };
  const firstReply = { id: "a1", role: "assistant" as const, content: "第一句回应" };
  const secondUser = { id: "u2", role: "user" as const, content: "第二句" };
  const secondReply = { id: "a2", role: "assistant" as const, content: "第二句回应" };

  assert.equal(completedConversationRounds([greeting]), 0);
  assert.equal(completedConversationRounds([greeting, firstUser]), 0);
  assert.equal(completedConversationRounds([greeting, firstUser, firstReply]), 1);
  assert.equal(completedConversationRounds([greeting, firstUser, firstReply, secondUser]), 1);
  assert.equal(completedConversationRounds([greeting, firstUser, firstReply, secondUser, secondReply]), 2);
});

function withFetch(response: Response, verify: (input: RequestInfo | URL, init?: RequestInit) => void) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    verify(input, init);
    return response;
  };
  return () => { globalThis.fetch = originalFetch; };
}

test("conversation adapter restores only server messages from the formal session route", async () => {
  const restore = withFetch(
    Response.json({ session: { id: "session-1" }, messages: [{ id: "m-1", role: "assistant", content: "已持久化的问候" }] }),
    (input, init) => {
      assert.equal(input, "/api/memories/memory-1/chat-session");
      assert.equal(init?.method, "POST");
      assert.equal(init?.credentials, "same-origin");
    }
  );
  try {
    const snapshot = await loadConversation("memory-1");
    assert.equal(snapshot.sessionId, "session-1");
    assert.deepEqual(snapshot.messages.map(({ role, content }) => ({ role, content })), [{ role: "assistant", content: "已持久化的问候" }]);
  } finally { restore(); }
});

test("first greeting uses the formal route and the original idempotency key", async () => {
  const restore = withFetch(
    Response.json({ greeting: { id: "greeting-1", role: "assistant", content: "服务端问候" } }),
    (input, init) => {
      assert.equal(input, "/api/memories/memory-1/first-greeting");
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "presence-create-1");
      assert.equal(init?.credentials, "same-origin");
      assert.deepEqual(JSON.parse(String(init?.body)), {});
    }
  );
  try {
    const greeting = await requestFirstGreeting("memory-1", "presence-create-1");
    assert.deepEqual(greeting, { id: "greeting-1", role: "assistant", content: "服务端问候", createdAt: undefined });
  } finally { restore(); }
});

test("first greeting does not accept a message alias", async () => {
  const restore = withFetch(Response.json({ message: { id: "greeting-1", role: "assistant", content: "服务端问候" } }), () => {});
  try {
    await assert.rejects(
      requestFirstGreeting("memory-1", "presence-create-1"),
      (error: unknown) => error instanceof Error && error.message === "FIRST_GREETING_INVALID"
    );
  } finally { restore(); }
});

test("subsequent messages send only the formal body and put their idempotency key in the header", async () => {
  const restore = withFetch(Response.json({ answer: "已收到" }), (input, init) => {
    assert.equal(input, "/api/memory-chat");
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "message-1");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      memoryId: "memory-1",
      question: "想和你说件事",
    });
  });
  try {
    await sendConversationMessage("memory-1", "想和你说件事", "message-1");
  } finally { restore(); }
});
