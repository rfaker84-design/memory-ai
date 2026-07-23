import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { NextRequest } from "next/server";

import type { Message } from "../../../features/chat/types";
import {
  FirstGreetingInProgressError,
  FirstGreetingProviderError,
} from "../../../features/chat/first-greeting-service";
import { ChatNotFoundError } from "../../../features/chat/errors";
import type { Memory } from "../../../features/memory/types";
import { createFirstGreetingHandler } from "./[id]/first-greeting/_handler";

process.env.AUTH_ALLOWED_ORIGIN = "http://localhost";

const memoryId = "11111111-1111-4111-8111-111111111111";
const userId = "session-owner";
const idempotencyKey = "first-greeting-key-0001";
const memory: Memory = {
  id: memoryId,
  userId,
  name: "Saved relative",
  relationship: "parent",
  lifeStory: "Saved profile only",
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};
const greetingMessage: Message = {
  id: "22222222-2222-4222-8222-222222222222",
  sessionId: "33333333-3333-4333-8333-333333333333",
  memoryId,
  userId,
  role: "assistant",
  content: "Saved-profile greeting",
  tokens: null,
  metadata: { kind: "first_greeting" },
  createdAt: "2026-07-22T00:00:01.000Z",
};

const context = { params: Promise.resolve({ id: memoryId }) };
const sessionResolver = async () => ({
  userId: "internal-owner",
  externalUserId: userId,
  expiresAt: "2026-07-23T00:00:00.000Z",
});

function request(key = idempotencyKey, body = "{}") {
  return new NextRequest(`http://localhost/api/memories/${memoryId}/first-greeting`, {
    method: "POST",
    headers: {
      origin: "http://localhost",
      ...(key ? { "idempotency-key": key } : {}),
      "content-type": "application/json",
    },
    body,
  });
}

test("first greeting uses only the HttpOnly session identity and accepts the empty contract body", async () => {
  const calls: unknown[] = [];
  const handler = createFirstGreetingHandler(
    () => ({ async getMemoryForUser(id, owner) { return id === memoryId && owner === userId ? memory : null; } }),
    () => ({
      async create(input) {
        calls.push(input);
        return { message: greetingMessage, sessionId: greetingMessage.sessionId!, replayed: false };
      },
    }),
    sessionResolver
  );
  const response = await handler(
    request(),
    context
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    session: {
      id: greetingMessage.sessionId,
      memoryId,
      userId,
    },
    greeting: {
      id: greetingMessage.id,
      sessionId: greetingMessage.sessionId,
      memoryId,
      role: "assistant",
      content: greetingMessage.content,
      createdAt: greetingMessage.createdAt,
    },
    idempotencyKey,
    replayed: false,
  });
  assert.deepEqual(calls, [{ userId, memoryId, idempotencyKey, memory }]);
});

test("first greeting rejects malformed and client-authored request bodies before service work", async () => {
  let greetingCalled = false;
  const handler = createFirstGreetingHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({ async create() { greetingCalled = true; return { message: greetingMessage, sessionId: greetingMessage.sessionId!, replayed: false }; } }),
    sessionResolver
  );

  for (const body of ["not-json", JSON.stringify({ userId: "forged" }), "[]", "null"]) {
    const response = await handler(request(idempotencyKey, body), context);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "INVALID_JSON" });
  }
  assert.equal(greetingCalled, false);
});

test("first greeting requires a session and an Idempotency-Key before service work", async () => {
  let memoryCalls = 0;
  const handler = createFirstGreetingHandler(
    () => ({ async getMemoryForUser() { memoryCalls += 1; return memory; } }),
    () => ({ async create() { return { message: greetingMessage, sessionId: greetingMessage.sessionId!, replayed: false }; } }),
    async () => null
  );
  const unauthenticated = await handler(request(), context);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error, "UNAUTHENTICATED");

  const keyedHandler = createFirstGreetingHandler(
    () => ({ async getMemoryForUser() { memoryCalls += 1; return memory; } }),
    () => ({ async create() { return { message: greetingMessage, sessionId: greetingMessage.sessionId!, replayed: false }; } }),
    sessionResolver
  );
  const missingKey = await keyedHandler(request(""), context);
  assert.equal(missingKey.status, 400);
  assert.equal((await missingKey.json()).error, "IDEMPOTENCY_KEY_REQUIRED");

  const invalidKey = await keyedHandler(request("short"), context);
  assert.equal(invalidKey.status, 400);
  assert.equal((await invalidKey.json()).error, "INVALID_IDEMPOTENCY_KEY");
  assert.equal(memoryCalls, 0);
});

test("foreign memory access is uniformly hidden and provider errors create no response message", async () => {
  let greetingCalled = false;
  const forbidden = createFirstGreetingHandler(
    () => ({ async getMemoryForUser() { return null; } }),
    () => ({ async create() { greetingCalled = true; return { message: greetingMessage, sessionId: greetingMessage.sessionId!, replayed: false }; } }),
    sessionResolver
  );
  const hidden = await forbidden(request(), context);
  assert.equal(hidden.status, 404);
  assert.deepEqual(await hidden.json(), { error: "MEMORY_NOT_FOUND" });
  assert.equal(greetingCalled, false);

  const providerFailure = createFirstGreetingHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({ async create() { throw new FirstGreetingProviderError("provider failed"); } }),
    sessionResolver
  );
  const unavailable = await providerFailure(request(), context);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "AI_UNAVAILABLE" });

  const removedAfterOwnershipCheck = createFirstGreetingHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({ async create() { throw new ChatNotFoundError("memory removed"); } }),
    sessionResolver
  );
  const removed = await removedAfterOwnershipCheck(request(), context);
  assert.equal(removed.status, 404);
  assert.deepEqual(await removed.json(), { error: "MEMORY_NOT_FOUND" });
});

test("first greeting has stable replay and in-progress responses", async () => {
  const replay = createFirstGreetingHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({ async create() { return { message: greetingMessage, sessionId: greetingMessage.sessionId!, replayed: true }; } }),
    sessionResolver
  );
  const replayResponse = await replay(request(), context);
  assert.equal(replayResponse.status, 200);
  assert.equal((await replayResponse.json()).replayed, true);

  const pending = createFirstGreetingHandler(
    () => ({ async getMemoryForUser() { return memory; } }),
    () => ({ async create() { throw new FirstGreetingInProgressError("pending"); } }),
    sessionResolver
  );
  const pendingResponse = await pending(request(), context);
  assert.equal(pendingResponse.status, 409);
  assert.deepEqual(await pendingResponse.json(), { error: "FIRST_GREETING_IN_PROGRESS" });
});

test("first greeting handler stays on the dedicated service path", () => {
  const source = readFileSync(
    new URL("./[id]/first-greeting/_handler.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /FirstGreetingService/);
  assert.match(source, /idempotency-key/);
  assert.match(source, /resolveSessionOwner/);
  assert.match(source, /request\.json\(/);
  assert.doesNotMatch(source, /MemoryEngineService/);
  assert.doesNotMatch(source, /supabase/i);
});
