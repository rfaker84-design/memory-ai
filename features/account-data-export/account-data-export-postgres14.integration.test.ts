import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const adminUrlValue = process.env.ACCOUNT_DATA_EXPORT_POSTGRES_GATE_ADMIN_URL;

function databaseUrl(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function migration(index: number): Promise<string> {
  const names = await readdir(new URL("../../database/migrations/", import.meta.url));
  const prefix = `${String(index).padStart(3, "0")}_`;
  const name = names.find((candidate) => candidate.startsWith(prefix));
  if (!name) throw new Error(`MIGRATION_NOT_FOUND_${prefix}`);
  return readFile(new URL(`../../database/migrations/${name}`, import.meta.url), "utf8");
}

async function reset(admin: InstanceType<typeof Client>, database: string): Promise<void> {
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [database]);
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
}

test("account data export uses a read-only PG14 snapshot and excludes internal/provider storage data", {
  skip: adminUrlValue ? false : "set ACCOUNT_DATA_EXPORT_POSTGRES_GATE_ADMIN_URL to run isolated destructive PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  assert.match(new URL(adminUrlValue).hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  const database = `account_data_export_gate_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const targetUrl = databaseUrl(adminUrlValue, database);
  const admin = new Client({ connectionString: adminUrlValue });
  await admin.connect();
  let target: InstanceType<typeof Client> | undefined;
  let closePostgresPool: (() => Promise<void>) | undefined;
  try {
    assert.match((await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "", /^14\./);
    await reset(admin, database);
    target = new Client({ connectionString: targetUrl });
    await target.connect();
    for (let index = 1; index <= 17; index += 1) await target.query(await migration(index));

    process.env.DATABASE_URL = targetUrl;
    process.env.DATABASE_SSL = "false";
    process.env.DATABASE_POOL_MAX = "4";
    const [{ PostgresAccountDataExportService, AccountDataExportError }, databaseModule] = await Promise.all([
      import("./account-data-export-service"),
      import("@/src/server/database"),
    ]);
    closePostgresPool = databaseModule.closePostgresPool;

    const user = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('export-owner') RETURNING id")).rows[0]!;
    const memory = (await target.query<{ id: string }>(
      "INSERT INTO memories(user_id,name,relationship,life_story,idempotency_key,creation_idempotency_key) VALUES ($1,'Export memory','family','private life story',$2,$3) RETURNING id",
      [user.id, "a".repeat(64), "export-memory-creation-key"],
    )).rows[0]!;
    const conversation = (await target.query<{ id: string }>("INSERT INTO conversations(user_id,memory_id,title,summary) VALUES ($1,$2,'private title','private summary') RETURNING id", [user.id, memory.id])).rows[0]!;
    await target.query("INSERT INTO messages(user_id,memory_id,conversation_id,role,content,emotion) VALUES ($1,$2,$3,'user','private message','calm')", [user.id, memory.id, conversation.id]);
    await target.query("INSERT INTO memory_fragments(memory_id,source_type,content,content_hash) VALUES ($1,'manual','private fragment',$2)", [memory.id, "b".repeat(64)]);
    const media = (await target.query<{ id: string }>(
      "INSERT INTO media_assets(user_id,memory_id,media_type,storage_key,mime_type,size_bytes,sha256,status,upload_attempts) VALUES ($1,$2,'image','private/cos/object-key.jpg','image/jpeg',123,$3,'uploaded',1) RETURNING id",
      [user.id, memory.id, "c".repeat(64)],
    )).rows[0]!;
    await target.query("INSERT INTO consent_records(user_id,memory_id,consent_type,status,owner_name,relationship_to_owner,proof_key,notes) VALUES ($1,$2,'portrait','granted','Owner','family','private-proof-key','private consent note')", [user.id, memory.id]);
    const order = (await target.query<{ id: string }>(
      `INSERT INTO payment_orders(user_id,memory_id,order_no,request_key,product_id,amount_fen,duration_days,chat_quota,status,expires_at)
       VALUES ($1,$2,'YM20260802000000ABCDEF123456','export-payment-request-key','memory_video_49',4900,30,100,'pending',NOW()+INTERVAL '1 day') RETURNING id`,
      [user.id, memory.id],
    )).rows[0]!;
    await target.query(
      `INSERT INTO refund_requests(user_id,memory_id,order_id,request_key,reason,merchant_refund_no,status,eligibility)
       VALUES ($1,$2,$3,'export-refund-request-key','unused_purchase','YR20260802000000ABCDEF123456','processing','eligible')`,
      [user.id, memory.id, order.id],
    );

    const service = new PostgresAccountDataExportService();
    const exported = await service.create({ userId: user.id, externalUserId: "export-owner", now: new Date("2026-08-02T00:00:00.000Z") });
    assert.equal(exported.schemaVersion, "memoryai-account-data-export-v1");
    assert.deepEqual(exported.aiDisclosure, {
      label: "AI生成纪念内容",
      appliesTo: ["assistant_messages", "video_jobs"],
      basis: "基于当时可用且经确认的资料生成，不代表真实人物或其真实表达",
    });
    assert.equal(exported.messages[0]?.content, "private message");
    assert.equal(exported.messages[0]?.aiGenerated, false);
    assert.match(exported.notices.join(" "), /AI 生成内容/);
    assert.equal(exported.media[0]?.id, media.id);
    assert.equal(exported.media[0]?.downloadEndpoint, `/api/media/${media.id}?expiresIn=300`);
    assert.equal(exported.payments[0]?.amountFen, 4900);
    const serialized = JSON.stringify(exported);
    for (const forbidden of ["export-owner", "private/cos/object-key.jpg", "private-proof-key", "provider_payload", "provider_transaction_id", "request_key"]) {
      assert.doesNotMatch(serialized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    await target.query(
      `INSERT INTO account_deletion_requests(user_id,status,content_delete_after,provider_delete_after,backup_expire_after,receipt_access_hash,receipt_access_expires_at)
       VALUES ($1,'content_pending',NOW(),NOW()+INTERVAL '1 day',NOW()+INTERVAL '2 days','x',NOW()+INTERVAL '2 days')`,
      [user.id],
    );
    await assert.rejects(
      service.create({ userId: user.id, externalUserId: "export-owner" }),
      (error: unknown) => error instanceof AccountDataExportError && error.code === "ACCOUNT_DELETION_IN_PROGRESS",
    );
  } finally {
    await closePostgresPool?.();
    await target?.end();
    await reset(admin, database).catch(() => undefined);
    await admin.end();
  }
});
