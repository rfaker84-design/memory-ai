import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import pg from "pg";

import { closePostgresPool } from "../../src/server/database";
import { ChatPostgresDataSource } from "./chat-postgres-datasource";

const { Client } = pg;
const adminUrlValue = process.env.CHAT_SESSION_POSTGRES_GATE_ADMIN_URL;
const gateDatabase = process.env.CHAT_SESSION_POSTGRES_GATE_DATABASE
  ?? "chat_session_gate_atomicity";

const migrations = [
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
  "014_commerce_credits_referrals.sql",
  "015_chat_default_session_atomicity.sql",
];

function targetUrl(adminUrl: URL): string {
  const target = new URL(adminUrl);
  target.pathname = `/${gateDatabase}`;
  return target.toString();
}

function assertIsolatedTarget(adminUrl: URL): void {
  assert.match(adminUrl.hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.match(gateDatabase, /^chat_session_gate_[a-z0-9_]+$/);
  assert.equal(process.env.CHAT_SESSION_POSTGRES_GATE_ALLOW_DROP, "YES");
}

async function resetDatabase(adminUrl: URL): Promise<string> {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [gateDatabase],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${gateDatabase}"`);
    await admin.query(`CREATE DATABASE "${gateDatabase}"`);
  } finally {
    await admin.end();
  }
  return targetUrl(adminUrl);
}

async function applyMigrations(url: string, last = migrations.length): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const file of migrations.slice(0, last)) {
      const sql = await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), "utf8");
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

async function seedMemory(
  url: string,
  externalId: string,
  suffix: string,
): Promise<{ userId: string; memoryId: string }> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const user = await client.query<{ id: string }>(
      "INSERT INTO users (external_id) VALUES ($1) RETURNING id",
      [externalId],
    );
    const memory = await client.query<{ id: string }>(
      `INSERT INTO memories (user_id, name, idempotency_key)
       VALUES ($1, $2, $3) RETURNING id`,
      [user.rows[0].id, `Atomic ${suffix}`, suffix.padEnd(64, "a").slice(0, 64)],
    );
    return { userId: user.rows[0].id, memoryId: memory.rows[0].id };
  } finally {
    await client.end();
  }
}

test(
  "015 isolated PostgreSQL 14 gate: atomic default session, greeting replay, recovery, and legacy duplicate consolidation",
  { skip: adminUrlValue ? false : "set CHAT_SESSION_POSTGRES_GATE_ADMIN_URL to run the destructive isolated gate", timeout: 120_000 },
  async (t) => {
    assert.ok(adminUrlValue);
    const adminUrl = new URL(adminUrlValue);
    assertIsolatedTarget(adminUrl);

    await t.test("24 concurrent calls share one canonical session and one first greeting", async () => {
      const url = await resetDatabase(adminUrl);
      await applyMigrations(url);
      process.env.DATABASE_URL = url;
      await closePostgresPool();
      const owner = "atomic-owner";
      const seeded = await seedMemory(url, owner, "atomic-owner-memory");
      const source = new ChatPostgresDataSource();

      const sessions = await Promise.all(
        Array.from({ length: 24 }, () => source.getOrCreateDefaultConversation(owner, seeded.memoryId)),
      );
      const ids = new Set(sessions.map((session) => session.id));
      assert.equal(ids.size, 1);

      const claims = await Promise.all(
        Array.from({ length: 24 }, () => source.claimFirstGreeting({
          userId: owner,
          memoryId: seeded.memoryId,
          idempotencyKey: "first-greeting-atomicity-0001",
        })),
      );
      assert.equal(new Set(claims.map((claim) => claim.conversation.id)).size, 1);
      const claimed = claims.filter((claim) => claim.status === "claimed");
      assert.equal(claimed.length, 1);
      await source.completeFirstGreeting({
        userId: owner,
        memoryId: seeded.memoryId,
        idempotencyKey: "first-greeting-atomicity-0001",
        conversationId: claimed[0].conversation.id,
        content: "唯一的首次问候",
      });

      const replayed = await Promise.all(
        Array.from({ length: 24 }, () => source.claimFirstGreeting({
          userId: owner,
          memoryId: seeded.memoryId,
          idempotencyKey: "first-greeting-atomicity-0001",
        })),
      );
      assert.ok(replayed.every((claim) => claim.status === "replayed"));
      assert.equal(new Set(replayed.map((claim) => claim.conversation.id)).size, 1);

      const refreshed = await source.getOrCreateDefaultConversation(owner, seeded.memoryId);
      assert.equal(refreshed.id, sessions[0].id);
      const messages = await source.listMessages(refreshed.id);
      assert.equal(messages.filter((message) => message.metadata?.kind === "first_greeting").length, 1);
      assert.equal(messages[0]?.content, "唯一的首次问候");

      const other = await seedMemory(url, "atomic-other-owner", "atomic-other-memory");
      const otherSession = await source.getOrCreateDefaultConversation("atomic-other-owner", other.memoryId);
      assert.notEqual(otherSession.id, refreshed.id);

      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        const defaults = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM conversations
           WHERE user_id = $1 AND memory_id = $2 AND is_default`,
          [seeded.userId, seeded.memoryId],
        );
        assert.equal(defaults.rows[0].count, "1");
      } finally {
        await client.end();
      }
      await closePostgresPool();
    });

    await t.test("legacy duplicates consolidate around the persisted greeting without message or idempotency loss", async () => {
      const url = await resetDatabase(adminUrl);
      await applyMigrations(url, 14);
      const seeded = await seedMemory(url, "legacy-owner", "legacy-owner-memory");
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        const first = await client.query<{ id: string }>(
          `INSERT INTO conversations (user_id, memory_id, title, created_at)
           VALUES ($1, $2, 'first', NOW() - INTERVAL '1 hour') RETURNING id`,
          [seeded.userId, seeded.memoryId],
        );
        const later = await client.query<{ id: string }>(
          `INSERT INTO conversations (user_id, memory_id, title)
           VALUES ($1, $2, 'later') RETURNING id`,
          [seeded.userId, seeded.memoryId],
        );
        const greetingMessage = await client.query<{ id: string }>(
          `INSERT INTO messages (conversation_id, user_id, memory_id, role, content, metadata)
           VALUES ($1, $2, $3, 'assistant', 'legacy greeting', '{"kind":"first_greeting"}') RETURNING id`,
          [first.rows[0].id, seeded.userId, seeded.memoryId],
        );
        await client.query(
          `INSERT INTO memory_first_greetings (
             user_id, memory_id, conversation_id, idempotency_key, status, assistant_message_id
           ) VALUES ($1, $2, $3, $4, 'completed', $5)`,
          [seeded.userId, seeded.memoryId, first.rows[0].id, "first-greeting-legacy-0001", greetingMessage.rows[0].id],
        );
        const turnMessages = await client.query<{ id: string }>(
          `INSERT INTO messages (conversation_id, user_id, memory_id, role, content)
           VALUES
             ($1, $2, $3, 'user', 'legacy question'),
             ($1, $2, $3, 'assistant', 'legacy answer')
           RETURNING id`,
          [later.rows[0].id, seeded.userId, seeded.memoryId],
        );
        await client.query(
          `INSERT INTO memory_chat_turns (
             user_id, memory_id, conversation_id, idempotency_key, request_hash, status,
             user_message_id, assistant_message_id
           ) VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7)`,
          [
            seeded.userId,
            seeded.memoryId,
            later.rows[0].id,
            "memory-chat-turn-legacy-0001",
            "a".repeat(64),
            turnMessages.rows[0].id,
            turnMessages.rows[1].id,
          ],
        );
        await client.query(await readFile(new URL("../../database/migrations/015_chat_default_session_atomicity.sql", import.meta.url), "utf8"));
        await client.query(await readFile(new URL("../../database/verification/015-chat-default-session-atomicity-postflight.sql", import.meta.url), "utf8"));

        const canonical = await client.query<{ id: string }>(
          `SELECT id FROM conversations
           WHERE user_id = $1 AND memory_id = $2 AND is_default`,
          [seeded.userId, seeded.memoryId],
        );
        assert.equal(canonical.rows[0].id, first.rows[0].id);
        const messageCount = await client.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM messages WHERE conversation_id = $1",
          [canonical.rows[0].id],
        );
        assert.equal(messageCount.rows[0].count, "3");
        const greeting = await client.query<{ conversation_id: string }>(
          "SELECT conversation_id FROM memory_first_greetings WHERE user_id = $1 AND memory_id = $2",
          [seeded.userId, seeded.memoryId],
        );
        const turn = await client.query<{ conversation_id: string }>(
          "SELECT conversation_id FROM memory_chat_turns WHERE user_id = $1 AND memory_id = $2",
          [seeded.userId, seeded.memoryId],
        );
        assert.equal(greeting.rows[0].conversation_id, canonical.rows[0].id);
        assert.equal(turn.rows[0].conversation_id, canonical.rows[0].id);

        await client.query(
          `INSERT INTO commerce_orders (
             user_id, order_no, request_key, product_id, platform, payment_rail, amount_fen, generation_credits
           ) VALUES ($1, 'YC20260727123456ABCDEFABCDEF', $2, 'memory_video_49', 'web', 'test', 4900, 2)`,
          [seeded.userId, "commerce-request-legacy-0001"],
        );
        await assert.rejects(
          client.query(
            `INSERT INTO commerce_orders (
               user_id, order_no, request_key, product_id, platform, payment_rail, amount_fen, generation_credits
             ) VALUES ($1, 'YC20260727123457ABCDEFABCDEF', $2, 'memory_video_49', 'web', 'test', 4900, 2)`,
            [seeded.userId, "commerce-request-legacy-0001"],
          ),
          /unique/i,
        );
      } finally {
        await client.end();
      }
    });
  },
);
