import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import pg from "pg";

const { Client } = pg;
const adminUrlValue = process.env.FREE_CHAT_POSTGRES_GATE_ADMIN_URL;
const databaseName = process.env.FREE_CHAT_POSTGRES_GATE_DATABASE ?? "free_chat_gate_023";

function databaseUrl(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function migration(index: number): Promise<string> {
  const prefix = `${String(index).padStart(3, "0")}_`;
  const names = await readdir(new URL("../../database/migrations/", import.meta.url));
  const name = names.find((candidate) => candidate.startsWith(prefix));
  if (!name) throw new Error(`MIGRATION_${prefix}_NOT_FOUND`);
  return readFile(new URL(`../../database/migrations/${name}`, import.meta.url), "utf8");
}

async function reset(admin: InstanceType<typeof Client>, database: string): Promise<void> {
  assert.match(database, /^free_chat_gate_[a-z0-9_]+$/);
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [database]);
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
}

test("Migration 023 PostgreSQL 14 first-run, replay, rollback, durable admissions, concurrency and connection-zero gate", {
  skip: adminUrlValue ? false : "set FREE_CHAT_POSTGRES_GATE_ADMIN_URL to run isolated destructive PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  const adminUrl = new URL(adminUrlValue);
  assert.match(adminUrl.hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.equal(process.env.FREE_CHAT_POSTGRES_GATE_ALLOW_DROP, "YES");
  const admin = new Client({ connectionString: adminUrlValue });
  await admin.connect();
  let target: InstanceType<typeof Client> | undefined;
  let closePostgresPool: (() => Promise<void>) | undefined;
  const environment = {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_SSL: process.env.DATABASE_SSL,
    DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
    MEMORYAI_FREE_CHAT_DAILY_LIMIT: process.env.MEMORYAI_FREE_CHAT_DAILY_LIMIT,
  };
  try {
    assert.match((await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "", /^14\./);
    await reset(admin, databaseName);
    const targetUrl = databaseUrl(adminUrlValue, databaseName);
    target = new Client({ connectionString: targetUrl });
    await target.connect();
    for (let index = 1; index <= 23; index += 1) await target.query(await migration(index));
    await target.query(await migration(23));
    assert.equal((await target.query("SELECT to_regclass('public.free_chat_daily_admissions') AS value")).rows[0]?.value, "free_chat_daily_admissions");
    assert.equal((await target.query("SELECT count(*)::int AS count FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid")).rows[0]?.count, 0);
    assert.equal((await target.query("SELECT count(*)::int AS count FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated")).rows[0]?.count, 0);
    assert.equal((await target.query("SELECT count(*)::int AS count FROM pg_constraint WHERE conname IN ('uq_free_chat_daily_admissions_request','ck_free_chat_daily_admissions_status','ck_free_chat_daily_admissions_lifecycle','ck_free_chat_daily_admissions_key')")).rows[0]?.count, 4);

    process.env.DATABASE_URL = targetUrl;
    process.env.DATABASE_SSL = "false";
    process.env.DATABASE_POOL_MAX = "4";
    process.env.MEMORYAI_FREE_CHAT_DAILY_LIMIT = "3";
    const [{ FreeChatDailyAdmissionService }, database] = await Promise.all([
      import("./free-chat-daily-admission"),
      import("@/src/server/database"),
    ]);
    closePostgresPool = database.closePostgresPool;
    const owner = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pg14-free-chat-owner') RETURNING id")).rows[0]!;
    const memory = (await target.query<{ id: string }>("INSERT INTO memories(user_id,name,idempotency_key,creation_idempotency_key) VALUES ($1,'Free chat gate TA',$2,$3) RETURNING id", [owner.id, "a".repeat(64), "b".repeat(64)])).rows[0]!;
    const admission = new FreeChatDailyAdmissionService();
    const attempts = await Promise.all(Array.from({ length: 12 }, (_, index) => admission.reserve({
      externalUserId: "pg14-free-chat-owner", memoryId: memory.id, idempotencyKey: `free-chat-concurrent-${String(index).padStart(4, "0")}`,
    })));
    assert.equal(attempts.filter((value) => value.status === "admitted").length, 3);
    assert.equal((await target.query("SELECT count(*)::int AS count FROM free_chat_daily_admissions WHERE status IN ('reserved','committed')")).rows[0]?.count, 3);
    const reservedKeys = (await target.query<{ idempotency_key: string }>("SELECT idempotency_key FROM free_chat_daily_admissions WHERE status='reserved' ORDER BY idempotency_key")).rows.map((row) => row.idempotency_key);
    assert.equal(reservedKeys.length, 3);
    const [firstKey, releaseKey, staleKey] = reservedKeys;
    assert.ok(firstKey && releaseKey && staleKey);
    const replay = await admission.reserve({ externalUserId: "pg14-free-chat-owner", memoryId: memory.id, idempotencyKey: firstKey });
    assert.equal(replay.status, "admitted");
    assert.equal((await target.query("SELECT count(*)::int AS count FROM free_chat_daily_admissions")).rows[0]?.count, 3);
    await admission.commit({ externalUserId: "pg14-free-chat-owner", memoryId: memory.id, idempotencyKey: firstKey });
    await admission.release({ externalUserId: "pg14-free-chat-owner", memoryId: memory.id, idempotencyKey: releaseKey });
    await target.query("UPDATE free_chat_daily_admissions SET reservation_expires_at=NOW()-INTERVAL '1 minute' WHERE idempotency_key=$1 AND status='reserved'", [staleKey]);
    const recovered = await admission.reserve({ externalUserId: "pg14-free-chat-owner", memoryId: memory.id, idempotencyKey: "free-chat-recovered-0001" });
    assert.equal(recovered.status, "admitted");
    assert.equal((await target.query("SELECT status FROM free_chat_daily_admissions WHERE idempotency_key=$1", [staleKey])).rows[0]?.status, "released");
    assert.deepEqual(await admission.reserve({ externalUserId: "missing-owner", memoryId: memory.id, idempotencyKey: "free-chat-missing-owner-1" }), { status: "limit_reached" });
    assert.equal((await target.query("SELECT count(*)::int AS count FROM free_chat_daily_admissions WHERE idempotency_key='free-chat-missing-owner-1'")).rows[0]?.count, 0);

    await closePostgresPool();
    closePostgresPool = undefined;
    await target.end();
    target = undefined;
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [databaseName])).rows[0]?.count, 0);

    const rollbackName = `${databaseName}_rollback`;
    await reset(admin, rollbackName);
    const rollback = new Client({ connectionString: databaseUrl(adminUrlValue, rollbackName) });
    await rollback.connect();
    try {
      for (let index = 1; index <= 22; index += 1) await rollback.query(await migration(index));
      await assert.rejects(rollback.query((await migration(23)).replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;")));
      await rollback.query("ROLLBACK");
      assert.equal((await rollback.query("SELECT to_regclass('public.free_chat_daily_admissions') AS value")).rows[0]?.value, null);
    } finally {
      await rollback.end();
    }
  } finally {
    await closePostgresPool?.();
    await target?.end();
    for (const [name, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await admin.end();
  }
});
