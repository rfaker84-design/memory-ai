import { randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";

import { MemoryPostgresDataSource } from "../../features/memory/memory-postgres-datasource";
import { MemoryMediaConflictError } from "../../features/memory/errors";
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
      idempotencyKey: randomUUID(),
      name: "Sprint15A verification",
      relationship: "test",
      lifeStory: "transactional CRUD verification",
      fragments: [{ sourceType: "test", content: randomUUID() }],
    };
    const created = await dataSource.create(input);
    memoryId = created.id;
    const repeated = await dataSource.create(input);
    if (repeated.id !== created.id) throw new Error("Create is not idempotent");

    const found = await dataSource.findByIdForUser(created.id, testUser);
    if (!found || found.userId !== testUser) throw new Error("Find failed");
    if (await dataSource.findByIdForUser(created.id, `${testUser}-other`)) {
      throw new Error("Owned find leaked another user's memory");
    }

    const listed = await dataSource.listByUser(testUser);
    if (!listed.some((memory) => memory.id === created.id)) throw new Error("List failed");

    const updated = await dataSource.updateForUser(created.id, testUser, {
      relationship: "verified",
      fragments: [{ sourceType: "test", content: randomUUID() }],
    });
    if (updated.relationship !== "verified") throw new Error("Update failed");
    let ownershipRejected = false;
    try {
      await dataSource.updateForUser(created.id, `${testUser}-other`, {
        relationship: "forbidden",
      });
    } catch {
      ownershipRejected = true;
    }
    if (!ownershipRejected) throw new Error("Owned update accepted another user");

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

    const internalUser = await queryPostgres<{ id: string }>(
      "SELECT id FROM users WHERE external_id = $1",
      [testUser]
    );
    const mediaId = randomUUID();
    await queryPostgres(
      `INSERT INTO media_assets
        (id,user_id,memory_id,media_type,storage_key,mime_type,size_bytes,sha256,status)
       VALUES ($1,$2,$3,'image',$4,'image/png',1,$5,'uploaded')`,
      [mediaId, internalUser.rows[0].id, created.id, `media/${testUser}/${created.id}/image/test.png`, "a".repeat(64)]
    );
    await queryPostgres(
      `INSERT INTO audit_logs (user_id,memory_id,action,message)
       VALUES ($1,$2,$3,'PostgreSQL lifecycle verification')`,
      [internalUser.rows[0].id, created.id, `test.memory.${created.id}`]
    );

    let mediaBlockedDelete = false;
    try {
      await dataSource.deleteForUser(created.id, testUser);
    } catch (error) {
      mediaBlockedDelete = error instanceof MemoryMediaConflictError;
    }
    if (!mediaBlockedDelete) throw new Error("Delete did not block unclean media");

    await queryPostgres(
      `UPDATE media_assets
       SET status='deleted',deleted_at=NOW(),cleaned_at=NOW(),storage_key=NULL
       WHERE id=$1`,
      [mediaId]
    );
    await dataSource.deleteForUser(created.id, testUser);
    memoryId = null;
    if (await dataSource.findById(created.id)) throw new Error("Delete failed");
    const dependentCounts = await queryPostgres<{
      fragments: string;
      media: string;
      retained_audit: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM memory_fragments WHERE memory_id=$1) AS fragments,
        (SELECT count(*)::text FROM media_assets WHERE memory_id=$1) AS media,
        (SELECT count(*)::text FROM audit_logs WHERE action=$2 AND memory_id IS NULL) AS retained_audit`,
      [created.id, `test.memory.${created.id}`]
    );
    if (
      dependentCounts.rows[0].fragments !== "0" ||
      dependentCounts.rows[0].media !== "0" ||
      dependentCounts.rows[0].retained_audit !== "1"
    ) {
      throw new Error("Delete foreign-key behavior failed");
    }
    await queryPostgres("DELETE FROM audit_logs WHERE action=$1", [
      `test.memory.${created.id}`,
    ]);

    console.log("POSTGRES_MEMORY_TEST", JSON.stringify({
      create: true, read: true, update: true, delete: true,
      list: true, chat: true, idempotency: true, rollback: true,
      ownership: true, mediaDeleteGuard: true, foreignKeys: true,
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
