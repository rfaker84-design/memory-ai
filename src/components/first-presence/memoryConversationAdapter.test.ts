import assert from "node:assert/strict";
import test from "node:test";

import {
  loadConversation,
  requestFirstGreeting,
  restoreConversationWithFirstGreeting,
  sendConversationMessage,
} from "./memoryConversationAdapter";
import { completedConversationRounds } from "../memory/conversationExperience";

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
    assert.deepEqual(greeting, {
      id: "greeting-1",
      sessionId: null,
      role: "assistant",
      content: "服务端问候",
      metadata: {},
      createdAt: undefined,
    });
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

test("refresh restores the same persisted greeting without requesting it again", async () => {
  const greeting = {
    id: "greeting-1",
    sessionId: "session-1",
    role: "assistant",
    content: "小雨，你回来了。",
    metadata: { kind: "first_greeting", idempotencyKey: "first-greeting-memory-1" },
  };
  const responses = [
    Response.json({ session: { id: "session-1" }, messages: [] }),
    Response.json({ greeting }),
    Response.json({ session: { id: "session-1" }, messages: [greeting] }),
    Response.json({ session: { id: "session-1" }, messages: [greeting] }),
  ];
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    const response = responses.shift();
    assert.ok(response, "unexpected request");
    return response;
  };

  try {
    const firstVisit = await restoreConversationWithFirstGreeting(
      "memory-1",
      "first-greeting-memory-1",
    );
    const refreshed = await restoreConversationWithFirstGreeting(
      "memory-1",
      "first-greeting-memory-1",
    );
    assert.equal(firstVisit.messages[0]?.id, "greeting-1");
    assert.equal(refreshed.messages[0]?.id, "greeting-1");
    assert.equal(calls.filter((url) => url.endsWith("/first-greeting")).length, 1);
    assert.equal(calls.filter((url) => url.endsWith("/chat-session")).length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refresh preserves the same two completed persisted rounds", async () => {
  const messages = [
    {
      id: "greeting-1",
      sessionId: "session-1",
      role: "assistant",
      content: "小雨，你回来了。",
      metadata: { kind: "first_greeting", idempotencyKey: "first-greeting-memory-1" },
    },
    {
      id: "user-1",
      sessionId: "session-1",
      role: "user",
      content: "今天想起我们以前散步的地方。",
      metadata: { kind: "memory_chat_turn", idempotencyKey: "message-1" },
    },
    {
      id: "assistant-1",
      sessionId: "session-1",
      role: "assistant",
      content: "我也记得，风吹过来的时候很安静。",
      metadata: { kind: "memory_chat_turn", idempotencyKey: "message-1" },
    },
    {
      id: "user-2",
      sessionId: "session-1",
      role: "user",
      content: "下次还想和你说说。",
      metadata: { kind: "memory_chat_turn", idempotencyKey: "message-2" },
    },
    {
      id: "assistant-2",
      sessionId: "session-1",
      role: "assistant",
      content: "好，我会在这里听你慢慢说。",
      metadata: { kind: "memory_chat_turn", idempotencyKey: "message-2" },
    },
  ];
  const responses = [
    Response.json({ session: { id: "session-1" }, messages }),
    Response.json({ session: { id: "session-1" }, messages }),
  ];
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    const response = responses.shift();
    assert.ok(response, "unexpected request");
    return response;
  };

  try {
    const firstVisit = await restoreConversationWithFirstGreeting(
      "memory-1",
      "first-greeting-memory-1",
    );
    const refreshed = await restoreConversationWithFirstGreeting(
      "memory-1",
      "first-greeting-memory-1",
    );
    assert.deepEqual(
      refreshed.messages.map((message) => message.id),
      firstVisit.messages.map((message) => message.id),
    );
    assert.equal(completedConversationRounds(firstVisit.messages), 2);
    assert.equal(completedConversationRounds(refreshed.messages), 2);
    assert.equal(calls.filter((url) => url.endsWith("/first-greeting")).length, 0);
    assert.equal(calls.filter((url) => url.endsWith("/chat-session")).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
