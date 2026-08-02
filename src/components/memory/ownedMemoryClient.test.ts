import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  loadOwnedMediaUrl,
  loadOwnedMemory,
  OwnedMemoryRequestError,
} from "./ownedMemoryClient";

const memory = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "synthetic-owner",
  name: "Synthetic memory",
  relationship: "test",
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};

test("detail and refresh load the formal owned Memory endpoint", async () => {
  const urls: string[] = [];
  const request = async (input: string | URL | Request) => {
    urls.push(String(input));
    return Response.json(memory);
  };
  const first = await loadOwnedMemory(memory.id, undefined, request as typeof fetch);
  const refreshed = await loadOwnedMemory(memory.id, undefined, request as typeof fetch);
  assert.deepEqual(first, memory);
  assert.deepEqual(refreshed, memory);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url === `/api/memories/${memory.id}`));
});

test("formal Memory 404 remains a controlled page state", async () => {
  const request = async () => Response.json(
    { error: "MEMORY_NOT_FOUND" },
    { status: 404 }
  );
  await assert.rejects(
    loadOwnedMemory(memory.id, undefined, request as typeof fetch),
    (error) =>
      error instanceof OwnedMemoryRequestError &&
      error.status === 404 &&
      error.code === "MEMORY_NOT_FOUND"
  );
});

test("owned Memory reads time out without widening the session boundary or retrying", async () => {
  await assert.rejects(
    loadOwnedMemory(memory.id, undefined, ((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch, 1),
    (error) => error instanceof OwnedMemoryRequestError
      && error.status === 408
      && error.code === "MEMORY_READ_TIMEOUT",
  );
});

test("portrait retrieval uses the owned signed-media endpoint", async () => {
  const urls: string[] = [];
  const request = async (input: string | URL | Request, init?: RequestInit) => {
      urls.push(String(input));
      assert.equal(input, "/api/media/portrait-asset");
      assert.equal(init?.credentials, "same-origin");
      return Response.json({ url: "https://signed.example.test/portrait" });
    };
  const first = await loadOwnedMediaUrl(
    "portrait-asset",
    undefined,
    request as typeof fetch,
  );
  const refreshed = await loadOwnedMediaUrl(
    "portrait-asset",
    undefined,
    request as typeof fetch,
  );
  assert.equal(first, "https://signed.example.test/portrait");
  assert.equal(refreshed, "https://signed.example.test/portrait");
  assert.deepEqual(urls, ["/api/media/portrait-asset", "/api/media/portrait-asset"]);
});

test("legacy detail and automatic-memory deep links only reach approved first-release surfaces", () => {
  const forbiddenClientAuth = new RegExp([
    "temporaryMemoryOwnerId",
    ["yijian", "session", "token"].join("_"),
    ["memoryai", "session", "token"].join("_"),
    "Authorization:\\s*`Bearer",
  ].join("|"));
  const detail = readFileSync(
    new URL("../../../app/memory/[id]/page.tsx", import.meta.url),
    "utf8"
  );
  const legacyLongTermMemory = readFileSync(
    new URL("../../../app/memory/[id]/long-term-memory/page.tsx", import.meta.url),
    "utf8"
  );
  const legacyMemoryRoom = readFileSync(
    new URL("../../../app/memory-room/page.tsx", import.meta.url),
    "utf8"
  );
  const chat = readFileSync(
    new URL("../../../app/memory-chat/[id]/page.tsx", import.meta.url),
    "utf8"
  );
  const conversation = readFileSync(
    new URL("../first-presence/MemoryConversationScene.tsx", import.meta.url),
    "utf8"
  );
  const conversationAdapter = readFileSync(
    new URL("../first-presence/memoryConversationAdapter.ts", import.meta.url),
    "utf8"
  );
  const create = readFileSync(
    new URL("../create-memory/CreateMemoryExperience.tsx", import.meta.url),
    "utf8"
  );
  assert.match(detail, /redirect\(`\/memory-chat\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.doesNotMatch(detail, /emotionEngine|PresenceAvatar|LongTermMemoryBetaEntry|setInterval/);
  assert.match(legacyLongTermMemory, /redirect\(`\/memory\/\$\{encodeURIComponent\(id\)\}\/pickup`\)/);
  assert.doesNotMatch(legacyLongTermMemory, /listLongTermMemories|correctLongTermMemory|deleteLongTermMemory/);
  assert.match(legacyMemoryRoom, /redirect\("\/memory-world"\)/);
  assert.doesNotMatch(legacyMemoryRoom, /emotionEngine|store|fetch\(/);
  assert.doesNotMatch(chat.toLowerCase(), /supabase|memories-mvp/);
  assert.match(chat, /loadOwnedMemory/);
  assert.match(conversationAdapter, /\/chat-session/);
  assert.doesNotMatch(conversation, /MemoryExperienceOffer|\/api\/payments\//);
  assert.match(conversationAdapter, /Idempotency-Key/);
  assert.doesNotMatch(conversationAdapter, /history:\s*messages/);
  assert.doesNotMatch(conversationAdapter, /fragments:\s*fragments/);
  assert.match(chat, /firstGreetingKey\(state\.memory\.id\)/);
  assert.match(create, /`\/memory-chat\/\$\{created\.id\}`/);
  for (const source of [detail, chat, conversation, conversationAdapter, create]) {
    assert.doesNotMatch(source, forbiddenClientAuth);
  }
});

test("formal auth and Memory list clients use the cookie session boundary", () => {
  const forbiddenListAuth = new RegExp([
    "memories-mvp",
    "\\?userId=",
    ["yijian", "session", "token"].join("_"),
    ["memoryai", "session", "token"].join("_"),
  ].join("|"));
  const sources = [
    readFileSync(new URL("../../../app/page.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("../../../app/memory-world/page.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("../../../app/(memory)/memory/page.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("../../../components/world/WorldShell.tsx", import.meta.url), "utf8"),
  ];
  for (const source of sources) {
    assert.doesNotMatch(source, forbiddenListAuth);
  }
  const auth = sources[3];
  assert.match(auth, /\/api\/auth\/send-code/);
  assert.match(auth, /\/api\/auth\/verify-code/);
  assert.match(auth, /challengeId/);
  assert.doesNotMatch(auth, /data\.code|setSentCode|\/api\/send-code|\/api\/verify-code/);
});
