import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import type {
  DeleteLongTermMemoryInput,
  ListLongTermMemoriesInput,
  LongTermMemory,
  UpdateLongTermMemoryInput,
} from "@/features/long-term-memory";
import { LongTermMemoryNotFoundError } from "@/features/long-term-memory";
import { createLongTermMemoryBetaHandlers } from "./[id]/long-term-memories/_handlers";

const memoryId = "11111111-1111-4111-8111-111111111111";
const longTermMemoryId = "22222222-2222-4222-8222-222222222222";
const ownerId = "synthetic-ltm-tester";

process.env.AUTH_ALLOWED_ORIGIN = "http://localhost";

const sessionResolver = async () => ({
  userId: "internal-owner",
  externalUserId: ownerId,
  expiresAt: "2026-07-27T00:00:00.000Z",
});

function memory(content = "用户在对话中提到：小时候一起去学校"): LongTermMemory {
  return {
    id: longTermMemoryId,
    memoryId,
    content,
    contentHash: "a".repeat(64),
    sourceType: "chat_user_message",
    sourceId: "33333333-3333-4333-8333-333333333333",
    importance: 60,
    tags: ["chat"],
    metadata: { sessionId: "private-session", userCorrected: false },
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
}

function fakeService() {
  let current: LongTermMemory | null = memory();
  const calls: Array<
    ListLongTermMemoriesInput | UpdateLongTermMemoryInput | DeleteLongTermMemoryInput
  > = [];
  return {
    calls,
    async listMemories(input: ListLongTermMemoriesInput) {
      calls.push(input);
      return current ? [current] : [];
    },
    async updateMemory(input: UpdateLongTermMemoryInput) {
      calls.push(input);
      if (!current) throw new LongTermMemoryNotFoundError();
      current = {
        ...current,
        content: input.content.trim(),
        metadata: { ...current.metadata, userCorrected: true },
        updatedAt: "2026-07-27T00:01:00.000Z",
      };
      return current;
    },
    async deleteMemory(input: DeleteLongTermMemoryInput) {
      calls.push(input);
      if (!current) throw new LongTermMemoryNotFoundError();
      current = null;
    },
  };
}

function request(method: "GET" | "PATCH" | "DELETE", body?: string) {
  return new NextRequest(
    `http://localhost/api/memories/${memoryId}/long-term-memories/${longTermMemoryId}`,
    {
      method,
      body,
      headers: {
        origin: "http://localhost",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
    }
  );
}

const collectionContext = { params: Promise.resolve({ id: memoryId }) };
const itemContext = {
  params: Promise.resolve({ id: memoryId, longTermMemoryId }),
};

test("the LTM beta API is invisible unless the exact beta access gate allows the session", async () => {
  const service = fakeService();
  const handlers = createLongTermMemoryBetaHandlers(
    () => service,
    sessionResolver,
    () => false
  );
  const response = await handlers.GET(request("GET"), collectionContext);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "BETA_NOT_AVAILABLE" });
  assert.equal(service.calls.length, 0);
});

test("an allowed test account can view only sanitized owned long-term memories", async () => {
  const service = fakeService();
  const handlers = createLongTermMemoryBetaHandlers(
    () => service,
    sessionResolver,
    (externalUserId) => externalUserId === ownerId
  );
  const response = await handlers.GET(request("GET"), collectionContext);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.memories[0].content, memory().content);
  assert.deepEqual(body.memories[0].metadata, { userCorrected: false });
  assert.equal(JSON.stringify(body).includes("private-session"), false);
  assert.deepEqual(service.calls[0], {
    externalUserId: ownerId,
    memoryId,
    limit: 100,
  });
});

test("an allowed test account can correct and delete a memory through exact owner-scoped inputs", async () => {
  const service = fakeService();
  const handlers = createLongTermMemoryBetaHandlers(
    () => service,
    sessionResolver,
    () => true
  );
  const corrected = await handlers.PATCH(
    request("PATCH", JSON.stringify({ content: "  更正后的真实内容  " })),
    itemContext
  );
  assert.equal(corrected.status, 200);
  assert.equal((await corrected.json()).memory.content, "更正后的真实内容");

  const deleted = await handlers.DELETE(request("DELETE"), itemContext);
  assert.equal(deleted.status, 204);
  assert.deepEqual(service.calls.slice(0, 2), [
    {
      externalUserId: ownerId,
      memoryId,
      longTermMemoryId,
      content: "  更正后的真实内容  ",
    },
    {
      externalUserId: ownerId,
      memoryId,
      longTermMemoryId,
    },
  ]);
});

test("the beta API rejects malformed corrections and missing sessions", async () => {
  const service = fakeService();
  const handlers = createLongTermMemoryBetaHandlers(
    () => service,
    sessionResolver,
    () => true
  );
  for (const body of [
    JSON.stringify({}),
    JSON.stringify({ content: " ", unknown: true }),
    JSON.stringify({ content: 42 }),
    "{broken",
  ]) {
    const response = await handlers.PATCH(request("PATCH", body), itemContext);
    assert.equal(response.status, 400);
  }

  const unauthenticated = createLongTermMemoryBetaHandlers(
    () => service,
    async () => null,
    () => true
  );
  const response = await unauthenticated.GET(request("GET"), collectionContext);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "UNAUTHENTICATED");
});
