import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const adminUrlValue = process.env.PICKUP_POSTGRES_GATE_ADMIN_URL;

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

test("confirmed pickup keeps original and organized text Owner-bound across confirmation replay, edit, list and delete", {
  skip: adminUrlValue ? false : "set PICKUP_POSTGRES_GATE_ADMIN_URL to run isolated destructive PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  assert.match(new URL(adminUrlValue).hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  const database = `pickup_gate_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
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
    const [{ ConfirmedPickupError, ConfirmedPickupPostgresService }, databaseModule] = await Promise.all([
      import("./confirmed-pickup-service"), import("@/src/server/database"),
    ]);
    closePostgresPool = databaseModule.closePostgresPool;
    const owner = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pickup-owner') RETURNING id")).rows[0]!;
    const other = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pickup-other') RETURNING id")).rows[0]!;
    const memory = (await target.query<{ id: string }>(
      "INSERT INTO memories(user_id,name,relationship,idempotency_key,creation_idempotency_key) VALUES ($1,'Confirmed Memory','family',$2,$3) RETURNING id",
      [owner.id, "a".repeat(64), "pickup-memory-create"],
    )).rows[0]!;
    const service = new ConfirmedPickupPostgresService();
    const input = { externalUserId: "pickup-owner", memoryId: memory.id, requestKey: "pickup-confirm-0001", originalText: "小时候她会在雨天接我放学。", organizedText: "雨天接送的已确认回忆。" };
    const created = await service.confirm(input);
    const replay = await service.confirm(input);
    assert.equal(replay.id, created.id);
    assert.equal((await target.query("SELECT count(*)::int AS count FROM long_term_memories WHERE memory_id=$1", [memory.id])).rows[0]?.count, 1);
    await assert.rejects(
      service.confirm({ ...input, organizedText: "不同文本" }),
      (error: unknown) => error instanceof ConfirmedPickupError && error.code === "REQUEST_KEY_CONFLICT",
    );
    assert.deepEqual(await service.list({ externalUserId: "pickup-owner", memoryId: memory.id }).then((rows) => rows.map((row) => row.id)), [created.id]);
    const updated = await service.update({ externalUserId: "pickup-owner", memoryId: memory.id, pickupId: created.id, originalText: "修订后的原话。", organizedText: "修订后的整理稿。" });
    assert.equal(updated.originalText, "修订后的原话。");
    assert.equal(updated.organizedText, "修订后的整理稿。");
    await assert.rejects(
      service.update({ externalUserId: "pickup-other", memoryId: memory.id, pickupId: created.id, originalText: "x", organizedText: "x" }),
      (error: unknown) => error instanceof ConfirmedPickupError && error.code === "PICKUP_NOT_FOUND",
    );
    await service.delete({ externalUserId: "pickup-owner", memoryId: memory.id, pickupId: created.id });
    assert.equal((await service.list({ externalUserId: "pickup-owner", memoryId: memory.id })).length, 0);
    assert.equal((await target.query("SELECT count(*)::int AS count FROM long_term_memories WHERE memory_id=$1", [memory.id])).rows[0]?.count, 0);
  } finally {
    await closePostgresPool?.();
    await target?.end();
    await reset(admin, database).catch(() => undefined);
    await admin.end();
  }
});
