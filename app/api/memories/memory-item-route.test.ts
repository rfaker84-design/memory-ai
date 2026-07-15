import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { NextRequest } from "next/server";

import {
  MemoryMediaConflictError,
  MemoryNotFoundError,
  MemoryValidationError,
} from "../../../features/memory/errors";
import type { Memory, UpdateOwnedMemoryInput } from "../../../features/memory/types";
import { createMemoryItemHandlers } from "./[id]/_handlers";

const memoryId = "11111111-1111-4111-8111-111111111111";
const ownerId = "synthetic-owner";
process.env.AUTH_ALLOWED_ORIGIN = "http://localhost";

const sessionResolver = (externalUserId = ownerId) => async () => ({
  userId: `internal-${externalUserId}`,
  externalUserId,
  expiresAt: "2026-07-16T00:00:00.000Z",
});

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: memoryId,
    userId: ownerId,
    name: "Synthetic memory",
    relationship: "test",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

function fakeService(options: { mediaConflict?: boolean } = {}) {
  let current: Memory | null = memory();
  const validId = (id: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new MemoryValidationError("memoryId is invalid");
    }
  };
  const owned = (id: string, userId: string) => {
    validId(id);
    return current?.id === id && current.userId === userId;
  };

  return {
    async getMemoryForUser(id: string, userId: string) {
      return owned(id, userId) ? current : null;
    },
    async updateMemoryForUser(
      id: string,
      userId: string,
      update: UpdateOwnedMemoryInput
    ) {
      if (!owned(id, userId) || !current) {
        throw new MemoryNotFoundError("Memory not found");
      }
      if (update.name !== undefined && !update.name.trim()) {
        throw new MemoryValidationError("name is required");
      }
      current = {
        ...current,
        ...update,
        updatedAt: "2026-07-15T00:01:00.000Z",
      };
      return current as Memory;
    },
    async deleteMemoryForUser(id: string, userId: string) {
      if (!owned(id, userId)) throw new MemoryNotFoundError("Memory not found");
      if (options.mediaConflict) {
        throw new MemoryMediaConflictError("media not clean");
      }
      current = null;
    },
  };
}

function request(
  method: "GET" | "PATCH" | "DELETE",
  body?: string,
  userId?: string
) {
  const url = new URL(`http://localhost/api/memories/${memoryId}`);
  if (userId) url.searchParams.set("userId", userId);
  return new NextRequest(url, {
    method,
    body,
    headers: {
      origin: "http://localhost",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
  });
}

const context = (id = memoryId) => ({ params: Promise.resolve({ id }) });

test("GET returns the formal Memory DTO for the owning external user", async () => {
  const handlers = createMemoryItemHandlers(() => fakeService(), sessionResolver());
  const response = await handlers.GET(request("GET"), context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), memory());
});

test("GET rejects an invalid memory id", async () => {
  const handlers = createMemoryItemHandlers(() => fakeService(), sessionResolver());
  const response = await handlers.GET(request("GET"), context("invalid"));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "INVALID_REQUEST");
});

test("GET hides missing and mismatched ownership behind the same 404", async () => {
  const handlers = createMemoryItemHandlers(() => fakeService(), sessionResolver());
  const missing = await handlers.GET(request("GET"), context("22222222-2222-4222-8222-222222222222"));
  const mismatchedHandlers = createMemoryItemHandlers(() => fakeService(), sessionResolver("another-user"));
  const mismatched = await mismatchedHandlers.GET(request("GET"), context());
  assert.equal(missing.status, 404);
  assert.equal(mismatched.status, 404);
  assert.deepEqual(await missing.json(), { error: "MEMORY_NOT_FOUND" });
  assert.deepEqual(await mismatched.json(), { error: "MEMORY_NOT_FOUND" });
});

test("missing session is 401 and a forged compatibility user is rejected", async () => {
  const unauthenticated = createMemoryItemHandlers(() => fakeService(), async () => null);
  const missing = await unauthenticated.GET(request("GET"), context());
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error, "UNAUTHENTICATED");

  const authenticated = createMemoryItemHandlers(() => fakeService(), sessionResolver());
  const forged = await authenticated.GET(request("GET", undefined, "another-user"), context());
  assert.equal(forged.status, 403);
  assert.equal((await forged.json()).error, "SESSION_USER_MISMATCH");
});

test("PATCH updates supported fields for the owner", async () => {
  const handlers = createMemoryItemHandlers(() => fakeService(), sessionResolver());
  const response = await handlers.PATCH(
    request("PATCH", JSON.stringify({ name: "Updated", birthYear: 1980 })),
    context()
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.name, "Updated");
  assert.equal(body.birthYear, 1980);
  assert.equal(body.userId, ownerId);
});

test("PATCH rejects empty, unknown, forbidden, malformed, and invalid fields", async () => {
  const handlers = createMemoryItemHandlers(() => fakeService(), sessionResolver());
  const cases = [
    JSON.stringify({}),
    JSON.stringify({ unknown: true }),
    JSON.stringify({ id: memoryId }),
    JSON.stringify({ userId: "other" }),
    JSON.stringify({ name: 42 }),
    JSON.stringify({ fragments: [{ sourceType: "test", content: 42 }] }),
    "{broken",
  ];
  for (const body of cases) {
    const response = await handlers.PATCH(request("PATCH", body), context());
    assert.equal(response.status, 400, body);
  }
});

test("PATCH retains datasource normalization and validation", async () => {
  const handlers = createMemoryItemHandlers(() => fakeService(), sessionResolver());
  const response = await handlers.PATCH(
    request("PATCH", JSON.stringify({ name: "   " })),
    context()
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "INVALID_REQUEST");
});

test("PATCH hides ownership mismatch behind 404", async () => {
  const handlers = createMemoryItemHandlers(() => fakeService(), sessionResolver("another-user"));
  const response = await handlers.PATCH(
    request("PATCH", JSON.stringify({ name: "Updated" })),
    context()
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "MEMORY_NOT_FOUND" });
});

test("DELETE succeeds once, then returns the deterministic 404 contract", async () => {
  const service = fakeService();
  const handlers = createMemoryItemHandlers(() => service, sessionResolver());
  const deleted = await handlers.DELETE(request("DELETE"), context());
  const repeated = await handlers.DELETE(request("DELETE"), context());
  assert.equal(deleted.status, 204);
  assert.equal(repeated.status, 404);
  assert.deepEqual(await repeated.json(), { error: "MEMORY_NOT_FOUND" });
});

test("DELETE hides ownership mismatch behind 404", async () => {
  const handlers = createMemoryItemHandlers(() => fakeService(), sessionResolver("another-user"));
  const response = await handlers.DELETE(
    request("DELETE"),
    context()
  );
  assert.equal(response.status, 404);
});

test("DELETE returns 409 while media objects are not cleaned", async () => {
  const handlers = createMemoryItemHandlers(() => fakeService({ mediaConflict: true }), sessionResolver());
  const response = await handlers.DELETE(request("DELETE"), context());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "MEMORY_MEDIA_NOT_CLEAN");
});

test("formal item operations preserve the PostgreSQL layering and ownership predicates", () => {
  const handlers = readFileSync(
    new URL("./[id]/_handlers.ts", import.meta.url),
    "utf8"
  );
  const dataSource = readFileSync(
    new URL("../../../features/memory/memory-postgres-datasource.ts", import.meta.url),
    "utf8"
  );
  assert.match(handlers, /MemoryService/);
  assert.match(handlers, /MemoryRepository/);
  assert.match(handlers, /MemoryPostgresDataSource/);
  assert.doesNotMatch(handlers, /SELECT |INSERT |UPDATE |DELETE FROM/);
  assert.doesNotMatch(handlers.toLowerCase(), /supabase|memories-mvp/);
  assert.match(dataSource, /findByIdForUser/);
  assert.match(dataSource, /m\.id = \$1 AND u\.external_id = \$2/);
  assert.match(dataSource, /cleaned_at IS NULL OR storage_key IS NOT NULL/);
});
