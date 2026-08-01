import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { NextRequest } from "next/server";

import type { MemoryDataSource } from "@/features/memory/datasource";
import { MemoryRepository } from "@/features/memory/memory-repository";
import { MemoryService } from "@/features/memory/memory-service";
import type {
  CreateMemoryInput,
  Memory,
  UpdateMemoryInput,
} from "@/features/memory/types";
import type { AuthSession } from "@/src/server/auth";

import { createMemoryRecoveryHandler } from "./_handler";

const ORIGIN = "https://memoryai.test";
const OWNER = "phone:owner-hash";
const OTHER_USER = "phone:other-user-hash";
const CREATION_KEY = "memory-create-recovery-0001";

process.env.AUTH_ALLOWED_ORIGIN = ORIGIN;

class RecoveryMemoryDataSource implements MemoryDataSource {
  readonly recovered = new Map<string, Memory>();
  createCount = 0;

  async create(input: CreateMemoryInput): Promise<Memory> {
    if (!input.idempotencyKey) throw new Error("test creation key is required");
    const lookupKey = `${input.userId}\0${input.idempotencyKey}`;
    const existing = this.recovered.get(lookupKey);
    if (existing) return existing;

    this.createCount += 1;
    const memory: Memory = {
      id: "00000000-0000-4000-8000-000000000001",
      userId: input.userId,
      name: input.name,
      relationship: input.relationship,
      lifeStory: input.lifeStory ?? null,
      personalityProfile: input.personalityProfile ?? null,
      speechStyle: input.speechStyle ?? null,
      catchPhrases: input.catchPhrases ?? null,
      photoUrl: input.photoUrl ?? null,
      photoAssetId: null,
      personalityTags: input.personalityTags ?? null,
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
    };
    this.recovered.set(lookupKey, memory);
    return memory;
  }

  async findByCreationIdempotencyKeyForUser(
    userId: string,
    idempotencyKey: string
  ): Promise<Memory | null> {
    return this.recovered.get(`${userId}\0${idempotencyKey}`) ?? null;
  }

  async findById(): Promise<Memory | null> {
    return null;
  }

  async update(_id: string, _memory: UpdateMemoryInput): Promise<Memory> {
    throw new Error("not used");
  }

  async delete(): Promise<void> {}

  async listByUser(): Promise<Memory[]> {
    return [];
  }
}

function session(externalUserId = OWNER): AuthSession {
  return {
    userId: "10000000-0000-4000-8000-000000000001",
    externalUserId,
    expiresAt: "2026-07-27T00:00:00.000Z",
  };
}

function request(
  body = "{}",
  idempotencyKey: string | null = CREATION_KEY,
  origin = ORIGIN
) {
  return new NextRequest(`${ORIGIN}/api/memories/recovery`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body,
  });
}

function assertNoStore(response: Response) {
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0"
  );
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("vary"), "Cookie, Origin");
}

test("a persisted Memory is recoverable with the same creation key without creating again", async () => {
  const dataSource = new RecoveryMemoryDataSource();
  const service = new MemoryService(new MemoryRepository(dataSource));
  const created = await service.createMemory({
    userId: OWNER,
    name: "阿姨",
    relationship: "亲人",
    speechStyle: "说话轻缓",
    idempotencyKey: CREATION_KEY,
  });
  const handler = createMemoryRecoveryHandler(
    () => service,
    async () => session()
  );

  const first = await handler(request());
  const replay = await handler(request());

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.deepEqual(await first.json(), created);
  assert.deepEqual(await replay.json(), created);
  assert.equal(dataSource.createCount, 1);
  assertNoStore(first);
  assertNoStore(replay);
});

test("recovery is scoped to the Session owner and uses the same 404 for absent and foreign keys", async () => {
  const dataSource = new RecoveryMemoryDataSource();
  const service = new MemoryService(new MemoryRepository(dataSource));
  await service.createMemory({
    userId: OWNER,
    name: "外婆",
    relationship: "亲人",
    idempotencyKey: CREATION_KEY,
  });

  const foreignHandler = createMemoryRecoveryHandler(
    () => service,
    async () => session(OTHER_USER)
  );
  const missingHandler = createMemoryRecoveryHandler(
    () => service,
    async () => session()
  );
  const foreign = await foreignHandler(request());
  const missing = await missingHandler(
    request("{}", "memory-create-recovery-missing")
  );

  assert.equal(foreign.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(await foreign.json(), { error: "MEMORY_NOT_FOUND" });
  assert.deepEqual(await missing.json(), { error: "MEMORY_NOT_FOUND" });
  assert.equal(dataSource.createCount, 1);
});

test("recovery rejects unauthenticated and wrong-Origin requests before service access", async () => {
  let serviceCalls = 0;
  const service = {
    async recoverCreatedMemory(): Promise<Memory | null> {
      serviceCalls += 1;
      return null;
    },
  };
  const unauthenticated = createMemoryRecoveryHandler(
    () => service,
    async () => null
  );
  const authenticated = createMemoryRecoveryHandler(
    () => service,
    async () => session()
  );

  const noSession = await unauthenticated(request());
  const wrongOrigin = await authenticated(
    request("{}", CREATION_KEY, "https://attacker.test")
  );

  assert.equal(noSession.status, 401);
  assert.deepEqual(await noSession.json(), { error: "UNAUTHENTICATED" });
  assert.equal(wrongOrigin.status, 403);
  assert.deepEqual(await wrongOrigin.json(), { error: "ORIGIN_NOT_ALLOWED" });
  assert.equal(serviceCalls, 0);
  assertNoStore(noSession);
  assertNoStore(wrongOrigin);
});

test("recovery requires the existing creation-key format and exactly an empty object body", async () => {
  let serviceCalls = 0;
  const handler = createMemoryRecoveryHandler(
    () => ({
      async recoverCreatedMemory(): Promise<Memory | null> {
        serviceCalls += 1;
        return null;
      },
    }),
    async () => session()
  );

  const cases: Array<{
    body: string;
    key: string | null;
    error: string;
  }> = [
    { body: "{}", key: null, error: "IDEMPOTENCY_KEY_REQUIRED" },
    { body: "{}", key: "short", error: "INVALID_IDEMPOTENCY_KEY" },
    { body: "", key: CREATION_KEY, error: "INVALID_REQUEST_BODY" },
    { body: "null", key: CREATION_KEY, error: "INVALID_REQUEST_BODY" },
    { body: "[]", key: CREATION_KEY, error: "INVALID_REQUEST_BODY" },
    {
      body: JSON.stringify({ memoryId: "00000000-0000-4000-8000-000000000001" }),
      key: CREATION_KEY,
      error: "INVALID_REQUEST_BODY",
    },
    {
      body: JSON.stringify({ userId: OWNER }),
      key: CREATION_KEY,
      error: "INVALID_REQUEST_BODY",
    },
    {
      body: JSON.stringify({ phone: "13800000000" }),
      key: CREATION_KEY,
      error: "INVALID_REQUEST_BODY",
    },
    {
      body: JSON.stringify({ name: "不能重新提交人物资料" }),
      key: CREATION_KEY,
      error: "INVALID_REQUEST_BODY",
    },
  ];

  for (const entry of cases) {
    const response = await handler(request(entry.body, entry.key));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: entry.error });
    assertNoStore(response);
  }
  assert.equal(serviceCalls, 0);
});

test("the formal recovery path exposes no internal key and the PostgreSQL lookup cannot guess by recency", () => {
  const handlerSource = readFileSync(
    "app/api/memories/recovery/_handler.ts",
    "utf8"
  );
  const dataSourceSource = readFileSync(
    "features/memory/memory-postgres-datasource.ts",
    "utf8"
  );

  assert.doesNotMatch(
    handlerSource,
    /creation_idempotency_key|storage_key|cos-nodejs|supabase/i
  );
  assert.match(
    dataSourceSource,
    /WHERE u\.external_id = \$1\s+AND m\.creation_idempotency_key = \$2\s+AND m\.metadata ->> 'account_deletion_tombstone' IS DISTINCT FROM 'true'\s+LIMIT 1/
  );
  assert.doesNotMatch(
    dataSourceSource.match(
      /async findByCreationIdempotencyKeyForUser[\s\S]*?return result\.rows\[0\] \? toMemory\(result\.rows\[0\]\) : null;/
    )?.[0] ?? "",
    /ORDER BY|created_at DESC/
  );
});
