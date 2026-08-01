import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const adminUrlValue = process.env.USER_REPORT_POSTGRES_GATE_ADMIN_URL;
const databaseName = process.env.USER_REPORT_POSTGRES_GATE_DATABASE ?? "user_report_gate_019";

function databaseUrl(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function migration(index: number): Promise<string> {
  const prefix = `${String(index).padStart(3, "0")}_`;
  const names = await readdir(new URL("../../database/migrations/", import.meta.url));
  const name = names.find((candidate) => candidate.startsWith(prefix));
  if (!name) throw new Error(`MIGRATION_NOT_FOUND_${prefix}`);
  return readFile(new URL(`../../database/migrations/${name}`, import.meta.url), "utf8");
}

async function reset(admin: InstanceType<typeof Client>, name: string): Promise<void> {
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [name]);
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.query(`CREATE DATABASE "${name}"`);
}

test("Migration 019 PostgreSQL 14 first-run, replay, rollback, report ownership, triage, and connection-zero gate", {
  skip: adminUrlValue ? false : "set USER_REPORT_POSTGRES_GATE_ADMIN_URL to run the destructive isolated PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  assert.match(new URL(adminUrlValue).hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.match(databaseName, /^user_report_gate_[a-z0-9_]+$/);
  const admin = new Client({ connectionString: adminUrlValue });
  await admin.connect();
  let target: InstanceType<typeof Client> | undefined;
  let closePostgresPool: (() => Promise<void>) | undefined;
  try {
    assert.match((await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "", /^14\./);
    await reset(admin, databaseName);
    const targetUrl = databaseUrl(adminUrlValue, databaseName);
    target = new Client({ connectionString: targetUrl });
    await target.connect();
    for (let index = 1; index <= 19; index += 1) await target.query(await migration(index));
    await target.query(await migration(19));

    assert.equal((await target.query("SELECT to_regclass('public.user_reports') AS value")).rows[0]?.value, "user_reports");
    assert.equal((await target.query("SELECT count(*)::int AS count FROM pg_index WHERE indrelid='public.user_reports'::regclass AND NOT indisvalid")).rows[0]?.count, 0);
    assert.equal((await target.query("SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid='public.user_reports'::regclass AND NOT convalidated")).rows[0]?.count, 0);

    const owner = (await target.query<{ id: string }>("INSERT INTO public.users(external_id) VALUES ('report-owner') RETURNING id")).rows[0]!;
    const other = (await target.query<{ id: string }>("INSERT INTO public.users(external_id) VALUES ('report-other') RETURNING id")).rows[0]!;
    const ownerMemory = (await target.query<{ id: string }>(
      "INSERT INTO public.memories(user_id,name,idempotency_key,creation_idempotency_key) VALUES ($1,'owner memory',$2,$3) RETURNING id",
      [owner.id, "a".repeat(64), "report-owner-memory-key"],
    )).rows[0]!;
    const otherMemory = (await target.query<{ id: string }>(
      "INSERT INTO public.memories(user_id,name,idempotency_key,creation_idempotency_key) VALUES ($1,'other memory',$2,$3) RETURNING id",
      [other.id, "b".repeat(64), "report-other-memory-key"],
    )).rows[0]!;
    const ownerMedia = (await target.query<{ id: string }>(
      "INSERT INTO public.media_assets(user_id,memory_id,media_type,storage_key,mime_type,size_bytes,status,sha256) VALUES ($1,$2,'image','media/owner.png','image/png',10,'uploaded',$3) RETURNING id",
      [owner.id, ownerMemory.id, "c".repeat(64)],
    )).rows[0]!;
    const otherMedia = (await target.query<{ id: string }>(
      "INSERT INTO public.media_assets(user_id,memory_id,media_type,storage_key,mime_type,size_bytes,status,sha256) VALUES ($1,$2,'image','media/other.png','image/png',10,'uploaded',$3) RETURNING id",
      [other.id, otherMemory.id, "d".repeat(64)],
    )).rows[0]!;
    const ownerVideo = (await target.query<{ id: string }>(
      "INSERT INTO public.video_generation_jobs(user_id,memory_id,idempotency_key,input_sha256) VALUES ($1,$2,'report-owner-video-key-0001',$3) RETURNING id",
      [owner.id, ownerMemory.id, "e".repeat(64)],
    )).rows[0]!;
    const ownerPayment = (await target.query<{ id: string }>(
      "INSERT INTO public.payment_orders(user_id,memory_id,order_no,request_key,product_id,amount_fen,duration_days,chat_quota,status,expires_at) VALUES ($1,$2,'YM20260802000000ABCDEF123456','report-owner-payment-key','report',1,1,1,'pending',NOW()+INTERVAL '1 day') RETURNING id",
      [owner.id, ownerMemory.id],
    )).rows[0]!;

    process.env.DATABASE_URL = targetUrl;
    process.env.DATABASE_SSL = "false";
    process.env.DATABASE_POOL_MAX = "4";
    const [{ PostgresUserReportService, UserReportError }, database] = await Promise.all([
      import("./user-report-service"),
      import("@/src/server/database"),
    ]);
    closePostgresPool = database.closePostgresPool;
    const service = new PostgresUserReportService();
    const create = (subjectType: "memory" | "media" | "video" | "payment" | "account" | "other", subjectId: string | null, requestKey: string) => service.create({
      userId: owner.id,
      externalUserId: "report-owner",
      requestKey,
      category: "rights",
      subjectType,
      subjectId,
      requestedAction: "review",
      details: "Please review this controlled report.",
    });
    const first = await create("memory", ownerMemory.id, "report-owner-memory-request-001");
    const replay = await create("memory", ownerMemory.id, "report-owner-memory-request-001");
    assert.equal(first.id, replay.id);
    assert.equal((await target.query("SELECT count(*)::int AS count FROM public.user_reports WHERE reporter_user_id=$1", [owner.id])).rows[0]?.count, 1);
    await create("media", ownerMedia.id, "report-owner-media-request-0001");
    await create("video", ownerVideo.id, "report-owner-video-request-0001");
    await create("payment", ownerPayment.id, "report-owner-payment-request-001");
    await create("account", owner.id, "report-owner-account-request-001");
    await create("other", null, "report-owner-other-request-00001");
    await assert.rejects(create("media", otherMedia.id, "report-owner-foreign-media-001"), (error: unknown) => error instanceof UserReportError && error.code === "SUBJECT_NOT_FOUND");
    await assert.rejects(create("memory", otherMemory.id, "report-owner-foreign-memory-01"), (error: unknown) => error instanceof UserReportError && error.code === "SUBJECT_NOT_FOUND");
    await assert.rejects(create("account", other.id, "report-owner-foreign-account-1"), (error: unknown) => error instanceof UserReportError && error.code === "SUBJECT_NOT_FOUND");
    assert.equal((await service.list({ userId: other.id, externalUserId: "report-other" })).length, 0);
    const triaged = await service.dispose({ reportId: first.id, status: "triaged", disposition: "Rights review queued.", reviewer: "reviewer@example.test" });
    assert.equal(triaged.status, "triaged");
    assert.equal(triaged.resolvedAt, null);
    const actioned = await service.dispose({ reportId: first.id, status: "actioned", disposition: "Controlled action recorded.", reviewer: "reviewer@example.test" });
    assert.equal(actioned.status, "actioned");
    assert.ok(actioned.resolvedAt);

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
      for (let index = 1; index <= 18; index += 1) await rollback.query(await migration(index));
      await assert.rejects(rollback.query((await migration(19)).replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;")));
      await rollback.query("ROLLBACK");
      assert.equal((await rollback.query("SELECT to_regclass('public.user_reports') AS value")).rows[0]?.value, null);
    } finally { await rollback.end(); }
  } finally {
    await closePostgresPool?.();
    await target?.end();
    await admin.end();
  }
});
