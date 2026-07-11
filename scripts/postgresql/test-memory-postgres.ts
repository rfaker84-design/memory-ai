import { randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";

import { MemoryPostgresDataSource } from "../../features/memory/memory-postgres-datasource";
import { ChatPostgresDataSource } from "../../features/chat/chat-postgres-datasource";
import {
  closePostgresPool,
  queryPostgres,
  withPostgresTransaction,
} from "../../src/server/database";

loadEnvConfig(process.cwd(), false);

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

  const dataSource = new MemoryPostgresDataSource();
  const chatDataSource = new ChatPostgresDataSource();
  const testUser = `sprint15a-test-${randomUUID()}`;
  const rollbackUser = `sprint15a-rollback-${randomUUID()}`;
  let memoryId: string | null = null;

  try {
    const input = {
      userId: testUser,
      name: "Sprint15A verification",
      relationship: "test",
      lifeStory: "transactional CRUD verification",
      fragments: [{ sourceType: "test", content: randomUUID() }],
    };
    const created = await dataSource.create(input);
    memoryId = created.id;
    const repeated = await dataSource.create(input);
    if (repeated.id !== created.id) throw new Error("Create is not idempotent");

    const found = await dataSource.findById(created.id);
    if (!found || found.userId !== testUser) throw new Error("Find failed");

    const listed = await dataSource.listByUser(testUser);
    if (!listed.some((memory) => memory.id === created.id)) throw new Error("List failed");

    const updated = await dataSource.update(created.id, {
      relationship: "verified",
      fragments: [{ sourceType: "test", content: randomUUID() }],
    });
    if (updated.relationship !== "verified") throw new Error("Update failed");

    const conversation = await chatDataSource.createConversation({
      userId: testUser,
      memoryId: created.id,
      title: "Sprint15A chat verification",
    });
    const message = await chatDataSource.createMessage({
      sessionId: conversation.id,
      memoryId: created.id,
      userId: testUser,
      role: "user",
      content: "PostgreSQL chat verification",
    });
    const messages = await chatDataSource.listMessages(conversation.id);
    if (messages.length !== 1 || messages[0].id !== message.id) {
      throw new Error("Chat persistence failed");
    }

    let rolledBack = false;
    try {
      await withPostgresTransaction(async (client) => {
        await client.query("INSERT INTO users (external_id) VALUES ($1)", [rollbackUser]);
        throw new Error("intentional rollback");
      });
    } catch {
      const result = await queryPostgres<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM users WHERE external_id = $1",
        [rollbackUser]
      );
      rolledBack = result.rows[0].count === "0";
    }
    if (!rolledBack) throw new Error("Transaction rollback failed");

    await dataSource.delete(created.id);
    memoryId = null;
    if (await dataSource.findById(created.id)) throw new Error("Delete failed");

    console.log("POSTGRES_MEMORY_TEST", JSON.stringify({
      create: true, read: true, update: true, delete: true,
      list: true, chat: true, idempotency: true, rollback: true,
    }));
  } finally {
    if (memoryId) await dataSource.delete(memoryId).catch(() => undefined);
    await queryPostgres("DELETE FROM users WHERE external_id = ANY($1::text[])", [
      [testUser, rollbackUser],
    ]).catch(() => undefined);
    await closePostgresPool();
  }
}

main().catch((error) => {
  console.error("POSTGRES_MEMORY_TEST_FAILED", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  process.exitCode = 1;
});
