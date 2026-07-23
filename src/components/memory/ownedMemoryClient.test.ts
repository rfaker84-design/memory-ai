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

test("portrait retrieval uses the owned signed-media endpoint", async () => {
  const url = await loadOwnedMediaUrl(
    "portrait-asset",
    undefined,
    async (input, init) => {
      assert.equal(input, "/api/media/portrait-asset");
      assert.equal(init?.credentials, "same-origin");
      return Response.json({ url: "https://signed.example.test/portrait" });
    }
  );
  assert.equal(url, "https://signed.example.test/portrait");
});

test("detail, chat, and create success paths contain no legacy data requests", () => {
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
  const chat = readFileSync(
    new URL("../../../app/memory-chat/[id]/page.tsx", import.meta.url),
    "utf8"
  );
  const create = readFileSync(
    new URL("../create-memory/CreateMemoryExperience.tsx", import.meta.url),
    "utf8"
  );
  const paymentClient = readFileSync(
    new URL("../payment/memoryExperienceClient.ts", import.meta.url),
    "utf8"
  );
  for (const [name, source] of [["detail", detail], ["chat", chat]]) {
    assert.doesNotMatch(source.toLowerCase(), /supabase|memories-mvp/, name);
    assert.match(source, /loadOwnedMemory/, name);
  }
  assert.match(chat, /\/chat-session/);
  assert.match(paymentClient, /\/api\/payments\/orders/);
  assert.match(chat, /MemoryExperienceOffer/);
  assert.match(chat, /Idempotency-Key/);
  assert.doesNotMatch(chat, /history:\s*messages/);
  assert.doesNotMatch(chat, /fragments:\s*fragments/);
  assert.match(create, /`\/memory\/\$\{created\.id\}`/);
  assert.match(create, /`\/memory-chat\/\$\{created\.id\}`/);
  for (const source of [detail, chat, create]) {
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
