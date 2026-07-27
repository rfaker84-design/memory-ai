import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { DatabaseDependencyError } from "@/src/server/database";
import { MemoryLimitError } from "@/features/memory/errors";
import type { CreateMemoryInput, Memory } from "@/features/memory/types";

import { createMemoriesHandlers } from "./_handlers";

const owner = "phone:memory-limit-owner";
process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";

function request(idempotencyKey: string): NextRequest {
  return new NextRequest("https://memoryai.test/api/memories", {
    method: "POST",
    headers: {
      origin: "https://memoryai.test",
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ name: "Memory limit contract" }),
  });
}

function ownerResolver() {
  return async () => ({
    externalUserId: owner,
    session: {
      userId: "00000000-0000-4000-8000-000000000001",
      externalUserId: owner,
      expiresAt: "2026-08-01T00:00:00.000Z",
    },
  });
}

function noOpAuditService() {
  return { log: async () => undefined as never };
}

function memoryFor(idempotencyKey: string, ordinal: number): Memory {
  return {
    id: `00000000-0000-4000-8000-${ordinal.toString().padStart(12, "0")}`,
    userId: owner,
    name: "Memory limit contract",
    relationship: "",
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    lifeStory: idempotencyKey,
  };
}

test("three Memories succeed, a fourth returns 409, and an original key still replays", async () => {
  const created = new Map<string, Memory>();
  const service = {
    async createMemory(input: CreateMemoryInput): Promise<Memory> {
      const key = input.idempotencyKey;
      assert.ok(key);
      const existing = created.get(key);
      if (existing) return existing;
      if (created.size >= 3) throw new MemoryLimitError("maximum reached");
      const memory = memoryFor(key, created.size + 1);
      created.set(key, memory);
      return memory;
    },
    async listUserMemories(): Promise<Memory[]> {
      return [...created.values()];
    },
  };
  const handlers = createMemoriesHandlers(
    () => service,
    noOpAuditService,
    ownerResolver(),
  );
  const keys = ["memory-limit-key-0001", "memory-limit-key-0002", "memory-limit-key-0003"];
  const responses = [];
  for (const key of keys) {
    const response = await handlers.POST(request(key));
    assert.equal(response.status, 200);
    responses.push(await response.json() as Memory);
  }

  const limited = await handlers.POST(request("memory-limit-key-0004"));
  assert.equal(limited.status, 409);
  assert.deepEqual(await limited.json(), { error: "MEMORY_LIMIT_REACHED" });
  assert.equal(created.size, 3);

  const replay = await handlers.POST(request(keys[0]));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json() as Memory).id, responses[0].id);
  assert.equal(created.size, 3);
});

test("a real database dependency failure remains a 503", async () => {
  const handlers = createMemoriesHandlers(
    () => ({
      async createMemory(): Promise<Memory> {
        throw new DatabaseDependencyError("connection_refused", "ECONNREFUSED");
      },
      async listUserMemories(): Promise<Memory[]> {
        return [];
      },
    }),
    noOpAuditService,
    ownerResolver(),
  );
  const response = await handlers.POST(request("memory-limit-database-error"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Database dependency unavailable" });
});
