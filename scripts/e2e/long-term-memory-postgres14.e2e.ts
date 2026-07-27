import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createLongTermMemoryBetaHandlers } from "@/app/api/memories/[id]/long-term-memories/_handlers";
import { createMemoryChatHandler } from "@/app/api/memory-chat/_handler";
import {
  LongTermMemoryPostgresDataSource,
  LongTermMemoryRepository,
  LongTermMemoryService,
} from "@/features/long-term-memory";
import { MemoryEngineService } from "@/features/memory-engine/memory-engine-service";
import { resolveInternalBetaAccess } from "@/src/server/beta-access";
import { closePostgresPool, queryPostgres } from "@/src/server/database";

const ownerExternalUserId = "isolated-pg14-ltm-owner";
const otherExternalUserId = "isolated-pg14-ltm-other";
const ownerInternalUserId = "11111111-1111-4111-8111-111111111111";
const otherInternalUserId = "33333333-3333-4333-8333-333333333333";
const memoryId = "22222222-2222-4222-8222-222222222222";

class IsolatedMemoryEngine extends MemoryEngineService {
  override async generateReply() {
    return { content: "我在这里，慢慢和你说。" };
  }
}

function sessionResolver(externalUserId: string, internalUserId: string) {
  return async () => ({
    userId: internalUserId,
    externalUserId,
    expiresAt: "2026-07-27T12:00:00.000Z",
  });
}

function chatRequest(idempotencyKey: string, question: string) {
  return new NextRequest("http://localhost/api/memory-chat", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ memoryId, question }),
  });
}

function itemRequest(
  method: "GET" | "PATCH" | "DELETE",
  longTermMemoryId?: string,
  body?: Record<string, unknown>
) {
  const suffix = longTermMemoryId ? `/${longTermMemoryId}` : "";
  return new NextRequest(
    `http://localhost/api/memories/${memoryId}/long-term-memories${suffix}`,
    {
      method,
      headers: {
        origin: "http://localhost",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
}

async function counts() {
  const result = await queryPostgres<{
    message_count: string;
    memory_count: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM messages WHERE memory_id = $1)::text AS message_count,
       (SELECT COUNT(*) FROM long_term_memories WHERE memory_id = $1)::text AS memory_count`,
    [memoryId]
  );
  return result.rows[0];
}

test(
  "PostgreSQL 14.23 E2E: flagged chat -> recall -> view -> correct -> delete",
  async () => {
    if (!process.env.MEMORYAI_TEST_DATABASE_URL) {
      throw new Error("MEMORYAI_TEST_DATABASE_URL is required for the PostgreSQL 14 gate");
    }
    if (process.env.DATABASE_URL !== process.env.MEMORYAI_TEST_DATABASE_URL) {
      throw new Error("DATABASE_URL must exactly match MEMORYAI_TEST_DATABASE_URL");
    }

    try {
      const version = await queryPostgres<{ server_version: string }>(
        "SHOW server_version"
      );
      assert.match(version.rows[0].server_version, /^14\.23(?:\D|$)/);
      assert.equal(
        resolveInternalBetaAccess("long-term-memory", ownerExternalUserId, {}).allowed,
        false,
        "the feature flag must fail closed when no internal-beta environment is supplied"
      );

      await queryPostgres(
        "INSERT INTO users (id, external_id) VALUES ($1, $2), ($3, $4)",
        [
          ownerInternalUserId,
          ownerExternalUserId,
          otherInternalUserId,
          otherExternalUserId,
        ]
      );
      await queryPostgres(
        `INSERT INTO memories (
           id, user_id, name, relationship, life_story,
           idempotency_key, creation_idempotency_key
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          memoryId,
          ownerInternalUserId,
          "隔离测试对象",
          "测试关系",
          "只存在于一次性隔离 PostgreSQL 14.23。",
          "a".repeat(64),
          "b".repeat(64),
        ]
      );

      const noFlagChat = createMemoryChatHandler(
        undefined,
        undefined,
        () => new IsolatedMemoryEngine(),
        sessionResolver(ownerExternalUserId, ownerInternalUserId),
        undefined,
        async () => ({ rateAllowed: true, concurrencyAllowed: true }),
        undefined,
        () => false
      );
      const noFlagResponse = await noFlagChat(
        chatRequest(
          "isolated-pg14-flag-off-turn-0001",
          "我记得小时候每周日都和妈妈去公园散步。"
        )
      );
      assert.equal(noFlagResponse.status, 200);
      assert.deepEqual(await counts(), { message_count: "2", memory_count: "0" });

      const chat = createMemoryChatHandler(
        undefined,
        undefined,
        () => new IsolatedMemoryEngine(),
        sessionResolver(ownerExternalUserId, ownerInternalUserId),
        undefined,
        async () => ({ rateAllowed: true, concurrencyAllowed: true }),
        undefined,
        () => true
      );
      const question = "我记得小时候每周六都和妈妈去公园散步。";
      const responses = await Promise.all([
        chat(chatRequest("isolated-pg14-concurrent-turn-0001", question)),
        chat(chatRequest("isolated-pg14-concurrent-turn-0002", question)),
      ]);
      for (const response of responses) {
        assert.equal(response.status, 200, JSON.stringify(await response.json()));
      }
      assert.deepEqual(await counts(), { message_count: "6", memory_count: "1" });

      const longTermMemoryService = new LongTermMemoryService(
        new LongTermMemoryRepository(new LongTermMemoryPostgresDataSource())
      );
      const recalled = await longTermMemoryService.recallMemory({
        externalUserId: ownerExternalUserId,
        memoryId,
        query: "小时候去公园",
        topK: 5,
      });
      assert.equal(recalled.memories.length, 1);
      assert.match(recalled.memories[0].content, /每周六.*公园/);

      const foreignRecall = await longTermMemoryService.recallMemory({
        externalUserId: otherExternalUserId,
        memoryId,
        query: "小时候去公园",
        topK: 5,
      });
      assert.deepEqual(foreignRecall.memories, []);

      const handlers = createLongTermMemoryBetaHandlers(
        undefined,
        sessionResolver(ownerExternalUserId, ownerInternalUserId),
        () => true
      );
      const collectionContext = { params: Promise.resolve({ id: memoryId }) };
      const viewResponse = await handlers.GET(itemRequest("GET"), collectionContext);
      assert.equal(viewResponse.status, 200);
      const viewed = (await viewResponse.json()).memories;
      assert.equal(viewed.length, 1);
      const longTermMemoryId = viewed[0].id as string;

      const foreignHandlers = createLongTermMemoryBetaHandlers(
        undefined,
        sessionResolver(otherExternalUserId, otherInternalUserId),
        () => true
      );
      const foreignView = await foreignHandlers.GET(itemRequest("GET"), collectionContext);
      assert.equal(foreignView.status, 200);
      assert.deepEqual((await foreignView.json()).memories, []);

      const itemContext = {
        params: Promise.resolve({ id: memoryId, longTermMemoryId }),
      };
      const correctedContent = "用户更正：小时候每周六和妈妈去公园散步。";
      const correctionResponse = await handlers.PATCH(
        itemRequest("PATCH", longTermMemoryId, { content: correctedContent }),
        itemContext
      );
      assert.equal(correctionResponse.status, 200);
      assert.equal((await correctionResponse.json()).memory.content, correctedContent);

      const correctedRecall = await longTermMemoryService.recallMemory({
        externalUserId: ownerExternalUserId,
        memoryId,
        query: "周六公园",
        topK: 5,
      });
      assert.deepEqual(
        correctedRecall.memories.map((memory) => memory.content),
        [correctedContent]
      );

      const deletionResponse = await handlers.DELETE(
        itemRequest("DELETE", longTermMemoryId),
        itemContext
      );
      assert.equal(deletionResponse.status, 204);

      const afterDelete = await longTermMemoryService.recallMemory({
        externalUserId: ownerExternalUserId,
        memoryId,
        query: "公园",
        topK: 5,
      });
      assert.deepEqual(afterDelete.memories, []);
      assert.deepEqual(await counts(), { message_count: "6", memory_count: "0" });
    } finally {
      await closePostgresPool().catch(() => undefined);
    }
  }
);
