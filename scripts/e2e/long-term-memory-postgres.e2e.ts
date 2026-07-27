import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { NextRequest } from "next/server";

import { createLongTermMemoryBetaHandlers } from "@/app/api/memories/[id]/long-term-memories/_handlers";
import { createMemoryChatHandler } from "@/app/api/memory-chat/_handler";
import {
  LongTermMemoryPostgresDataSource,
  LongTermMemoryRepository,
  LongTermMemoryService,
} from "@/features/long-term-memory";
import { MemoryEngineService } from "@/features/memory-engine/memory-engine-service";
import { closePostgresPool, queryPostgres } from "@/src/server/database";

const MIGRATIONS = [
  "001_memoryai_core.sql",
  "002_memoryai_indexes.sql",
  "003_memoryai_constraints.sql",
  "004_media_storage_foundation.sql",
  "005_memory_creation_idempotency.sql",
  "006_auth_verification_challenges.sql",
  "007_long_term_memories.sql",
  "008_memory_first_greetings.sql",
  "009_memory_chat_turn_idempotency.sql",
  "010_memory_experience_payments.sql",
  "011_business_funnel_events.sql",
  "012_payment_refund_requests.sql",
  "013_wechat_auth_identities.sql",
] as const;

const externalUserId = "isolated-ltm-e2e-user";
const internalUserId = "11111111-1111-4111-8111-111111111111";
const memoryId = "22222222-2222-4222-8222-222222222222";

class IsolatedMemoryEngine extends MemoryEngineService {
  override async generateReply() {
    return { content: "我在这里，慢慢和你说。" };
  }
}

async function availableLoopbackPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("LOOPBACK_PORT_UNAVAILABLE"));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function applySchema(database: PGlite): Promise<void> {
  for (const migration of MIGRATIONS) {
    const sql = await readFile(
      path.join(process.cwd(), "database", "migrations", migration),
      "utf8"
    );
    await database.exec(sql);
  }
}

function sessionResolver() {
  return async () => ({
    userId: internalUserId,
    externalUserId,
    expiresAt: "2026-07-27T12:00:00.000Z",
  });
}

function chatRequest() {
  return new NextRequest("http://localhost/api/memory-chat", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "content-type": "application/json",
      "idempotency-key": "isolated-ltm-chat-turn-0001",
    },
    body: JSON.stringify({
      memoryId,
      question: "我记得小时候每周日都和妈妈去公园散步。",
    }),
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

test(
  "isolated PostgreSQL E2E: chat -> recall -> view -> correct -> delete",
  async () => {
    const database = await PGlite.create({ extensions: { pgcrypto } });
    const port = await availableLoopbackPort();
    const socketServer = new PGLiteSocketServer({
      db: database,
      host: "127.0.0.1",
      port,
      maxConnections: 1,
    });
    const originalEnvironment = {
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_SSL: process.env.DATABASE_SSL,
      DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
      AUTH_ALLOWED_ORIGIN: process.env.AUTH_ALLOWED_ORIGIN,
      LLM_PROVIDER: process.env.LLM_PROVIDER,
    };

    try {
      await applySchema(database);
      await database.query(
        `INSERT INTO users (id, external_id) VALUES ($1, $2)`,
        [internalUserId, externalUserId]
      );
      await database.query(
        `INSERT INTO memories (
           id, user_id, name, relationship, life_story,
           idempotency_key, creation_idempotency_key
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          memoryId,
          internalUserId,
          "隔离测试对象",
          "测试关系",
          "只存在于一次性隔离 PostgreSQL。",
          "a".repeat(64),
          "b".repeat(64),
        ]
      );

      await socketServer.start();
      process.env.DATABASE_URL =
        `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
      process.env.DATABASE_SSL = "false";
      process.env.DATABASE_POOL_MAX = "1";
      process.env.AUTH_ALLOWED_ORIGIN = "http://localhost";
      process.env.LLM_PROVIDER = "mock";

      const chat = createMemoryChatHandler(
        undefined,
        undefined,
        () => new IsolatedMemoryEngine(),
        sessionResolver(),
        undefined,
        async () => ({ rateAllowed: true, concurrencyAllowed: true }),
        undefined,
        () => true
      );
      const chatResponse = await chat(chatRequest());
      const chatBody = await chatResponse.json();
      assert.equal(chatResponse.status, 200, JSON.stringify(chatBody));
      assert.equal(chatBody.answer, "我在这里，慢慢和你说。");

      const persisted = await queryPostgres<{
        message_count: string;
        memory_count: string;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM messages WHERE memory_id = $1)::text AS message_count,
           (SELECT COUNT(*) FROM long_term_memories WHERE memory_id = $1)::text AS memory_count`,
        [memoryId]
      );
      assert.deepEqual(persisted.rows[0], {
        message_count: "2",
        memory_count: "1",
      });

      const longTermMemoryService = new LongTermMemoryService(
        new LongTermMemoryRepository(new LongTermMemoryPostgresDataSource())
      );
      const recalled = await longTermMemoryService.recallMemory({
        externalUserId,
        memoryId,
        query: "小时候去公园",
        topK: 5,
      });
      assert.equal(recalled.memories.length, 1);
      assert.match(recalled.memories[0].content, /小时候.*公园/);

      const handlers = createLongTermMemoryBetaHandlers(
        undefined,
        sessionResolver(),
        () => true
      );
      const collectionContext = { params: Promise.resolve({ id: memoryId }) };
      const viewResponse = await handlers.GET(
        itemRequest("GET"),
        collectionContext
      );
      assert.equal(viewResponse.status, 200);
      const viewed = (await viewResponse.json()).memories;
      assert.equal(viewed.length, 1);
      const longTermMemoryId = viewed[0].id as string;

      const itemContext = {
        params: Promise.resolve({ id: memoryId, longTermMemoryId }),
      };
      const correctedContent = "用户更正：小时候每周六和妈妈去公园散步。";
      const correctionResponse = await handlers.PATCH(
        itemRequest("PATCH", longTermMemoryId, {
          content: correctedContent,
        }),
        itemContext
      );
      assert.equal(correctionResponse.status, 200);
      assert.equal((await correctionResponse.json()).memory.content, correctedContent);

      const correctedRecall = await longTermMemoryService.recallMemory({
        externalUserId,
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
        externalUserId,
        memoryId,
        query: "公园",
        topK: 5,
      });
      assert.deepEqual(afterDelete.memories, []);

      const finalCounts = await queryPostgres<{
        message_count: string;
        memory_count: string;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM messages WHERE memory_id = $1)::text AS message_count,
           (SELECT COUNT(*) FROM long_term_memories WHERE memory_id = $1)::text AS memory_count`,
        [memoryId]
      );
      assert.deepEqual(finalCounts.rows[0], {
        message_count: "2",
        memory_count: "0",
      });
    } finally {
      await closePostgresPool().catch(() => undefined);
      await socketServer.stop().catch(() => undefined);
      await database.close().catch(() => undefined);
      for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
);
