import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const adminUrlValue = process.env.OPERATIONS_POSTGRES_GATE_ADMIN_URL;

function gateUrl(adminUrl: string, database: string): string {
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

test("PostgreSQL 14 operations baseline returns only aggregate upload, video latency and credits", {
  skip: adminUrlValue ? false : "set OPERATIONS_POSTGRES_GATE_ADMIN_URL to run isolated destructive PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  assert.match(new URL(adminUrlValue).hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  const databaseName = `operations_gate_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const admin = new Client({ connectionString: adminUrlValue });
  await admin.connect();
  let target: InstanceType<typeof Client> | undefined;
  let closePostgresPool: (() => Promise<void>) | undefined;
  try {
    assert.match((await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "", /^14\./);
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const targetUrl = gateUrl(adminUrlValue, databaseName);
    target = new Client({ connectionString: targetUrl });
    await target.connect();
    for (let index = 1; index <= 17; index += 1) await target.query(await migration(index));
    const user = (await target.query<{ id: string }>("INSERT INTO public.users(external_id) VALUES ('operations-gate-user') RETURNING id")).rows[0]!;
    const memory = (await target.query<{ id: string }>(
      "INSERT INTO public.memories(user_id,name,idempotency_key,creation_idempotency_key) VALUES ($1,'operations gate',$2,$3) RETURNING id",
      [user.id, "a".repeat(64), "operations-gate-memory-key"],
    )).rows[0]!;
    await target.query(
      `INSERT INTO public.media_assets(user_id,memory_id,media_type,storage_key,mime_type,size_bytes,status,sha256)
       VALUES ($1,$2,'image','private-test-key','image/png',2028688,'uploaded',$3)`,
      [user.id, memory.id, "b".repeat(64)],
    );
    await target.query(
      `INSERT INTO public.video_generation_jobs
       (user_id,memory_id,idempotency_key,input_sha256,status,provider_submission_state,provider_task_id,quality_status,entitlement_settlement,actual_credits,created_at,updated_at)
       VALUES ($1,$2,'operations-gate-video-key',$3,'succeeded','accepted','operations-task','approved','committed',2,NOW()-INTERVAL '10 seconds',NOW())`,
      [user.id, memory.id, "c".repeat(64)],
    );
    process.env.DATABASE_URL = targetUrl;
    process.env.DATABASE_SSL = "false";
    process.env.DATABASE_POOL_MAX = "2";
    const [{ OperationsPostgresDataSource }, database] = await Promise.all([
      import("./operations-postgres-datasource"),
      import("@/src/server/database"),
    ]);
    closePostgresPool = database.closePostgresPool;
    const summary = await new OperationsPostgresDataSource().summary(new Date("2026-08-02T00:00:00.000Z"));
    assert.deepEqual({ ...summary.video, terminalP95Seconds: 0 }, {
      active: 0, submissionUncertain: 0, qualityPending: 0, manualReview: 0,
      terminalLast24Hours: 1, terminalP95Seconds: 0, committedCreditsLast24Hours: 2,
    });
    assert.ok(summary.video.terminalP95Seconds >= 10 && summary.video.terminalP95Seconds < 20);
    assert.deepEqual(summary.media, { uploadsLast24Hours: 1, uploadedBytesLast24Hours: 2028688 });
    assert.doesNotMatch(JSON.stringify(summary), /operations-gate-user|private-test-key|operations-task|memoryId|userId/);
    await closePostgresPool();
    closePostgresPool = undefined;
    await target.end();
    target = undefined;
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [databaseName])).rows[0]?.count, 0);
  } finally {
    await closePostgresPool?.();
    await target?.end();
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [databaseName]);
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
});
