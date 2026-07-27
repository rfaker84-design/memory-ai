import assert from "node:assert/strict";
import test from "node:test";

import {
  correctLongTermMemory,
  deleteLongTermMemory,
  listLongTermMemories,
  LongTermMemoryBetaRequestError,
} from "./longTermMemoryBetaClient";

const memoryId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const item = {
  id: itemId,
  memoryId,
  content: "真实内容",
  contentHash: "a".repeat(64),
  sourceType: "chat_user_message",
  sourceId: null,
  importance: 60,
  tags: ["chat"],
  metadata: { userCorrected: false },
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
};

test("LTM beta client supports view, correction, and deletion without user-id parameters", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const request = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (init?.method === "PATCH") {
      return Response.json({ memory: { ...item, content: "更正内容" } });
    }
    return Response.json({ memories: [item] });
  };

  assert.equal((await listLongTermMemories(memoryId, undefined, request as typeof fetch))[0].content, "真实内容");
  assert.equal((await correctLongTermMemory(memoryId, itemId, "更正内容", request as typeof fetch)).content, "更正内容");
  await deleteLongTermMemory(memoryId, itemId, request as typeof fetch);

  assert.equal(calls.length, 3);
  assert.equal(calls.every((call) => !call.url.includes("userId=")), true);
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { content: "更正内容" });
});

test("LTM beta client preserves the server beta-unavailable boundary", async () => {
  await assert.rejects(
    () =>
      listLongTermMemories(
        memoryId,
        undefined,
        (async () =>
          Response.json({ error: "BETA_NOT_AVAILABLE" }, { status: 404 })) as typeof fetch
      ),
    (error) =>
      error instanceof LongTermMemoryBetaRequestError
      && error.status === 404
      && error.code === "BETA_NOT_AVAILABLE"
  );
});
