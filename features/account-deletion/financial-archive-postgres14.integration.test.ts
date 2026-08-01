import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const adminUrlValue = process.env.ACCOUNT_DELETION_POSTGRES_GATE_ADMIN_URL;

function databaseUrl(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function migration(prefix: string): Promise<string> {
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

test("Financial archive is a separate PG14 database, keeps only minimum payment data and removes live financial product rows", {
  skip: adminUrlValue ? false : "set ACCOUNT_DELETION_POSTGRES_GATE_ADMIN_URL to run isolated destructive PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const appName = `account_deletion_finance_gate_${suffix}`;
  const archiveName = `account_deletion_finance_archive_${suffix}`;
  const admin = new Client({ connectionString: adminUrlValue });
  await admin.connect();
  let app: InstanceType<typeof Client> | undefined;
  try {
    assert.match((await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "", /^14\./);
    await reset(admin, appName);
    await reset(admin, archiveName);
    app = new Client({ connectionString: databaseUrl(adminUrlValue, appName) });
    await app.connect();
    for (let index = 1; index <= 17; index += 1) await app.query(await migration(`${String(index).padStart(3, "0")}_`));
    const archive = new Client({ connectionString: databaseUrl(adminUrlValue, archiveName) });
    await archive.connect();
    try { await archive.query(await migration("018_")); }
    finally { await archive.end(); }

    const appUrl = databaseUrl(adminUrlValue, appName);
    const archiveUrl = databaseUrl(adminUrlValue, archiveName);
    Object.assign(process.env, {
      DATABASE_URL: appUrl,
      DATABASE_SSL: "false",
      ACCOUNT_DELETION_FINANCIAL_ARCHIVE_DATABASE_URL: archiveUrl,
      ACCOUNT_DELETION_FINANCIAL_ARCHIVE_DATABASE_SSL: "false",
      ACCOUNT_DELETION_FINANCIAL_ARCHIVE_HMAC_KEY: "financial-archive-test-key-with-at-least-32-bytes",
      ACCOUNT_DELETION_FINANCIAL_RETENTION_DAYS: "1095",
    });
    const [{ archiveFinancialRecords, purgeLiveFinancialProductRecords, FinancialArchiveConfigurationError }, database] = await Promise.all([
      import("./financial-archive"),
      import("@/src/server/database"),
    ]);
    const user = (await app.query<{ id: string }>("INSERT INTO public.users(external_id) VALUES ('financial-archive-gate') RETURNING id")).rows[0]!;
    const memory = (await app.query<{ id: string }>(
      "INSERT INTO public.memories(user_id,name,idempotency_key,creation_idempotency_key) VALUES ($1,'archive gate memory',$2,$3) RETURNING id",
      [user.id, "a".repeat(64), "financial-archive-memory-key"],
    )).rows[0]!;
    await app.query(
      `INSERT INTO public.payment_orders
       (user_id,memory_id,order_no,request_key,product_id,amount_fen,duration_days,chat_quota,status,expires_at)
       VALUES ($1,$2,'YM20260801000000ABCDEF123456','financial-archive-order-key','memory_video_49',4900,30,100,'pending',NOW()+INTERVAL '1 day')`,
      [user.id, memory.id],
    );
    const requestId = randomUUID();
    await archiveFinancialRecords({ deletionRequestId: requestId, userId: user.id });
    await archiveFinancialRecords({ deletionRequestId: requestId, userId: user.id });
    await purgeLiveFinancialProductRecords(user.id);
    assert.equal((await app.query("SELECT count(*)::int AS count FROM public.payment_orders WHERE user_id=$1", [user.id])).rows[0]?.count, 0);
    const checkedArchive = new Client({ connectionString: archiveUrl });
    await checkedArchive.connect();
    try {
      const row = (await checkedArchive.query<{ records: Record<string, unknown>; subject_reference_hash: string }>(
        "SELECT records,subject_reference_hash FROM financial_archive.account_deletion_financial_archives WHERE deletion_request_id=$1::uuid", [requestId],
      )).rows[0];
      assert.ok(row);
      assert.match(row.subject_reference_hash, /^[0-9a-f]{64}$/);
      assert.deepEqual(Object.keys(row.records).sort(), ["commerce_orders", "commerce_refund_requests", "payment_orders", "refund_requests"]);
      assert.equal(JSON.stringify(row.records).includes(user.id), false);
      assert.equal(JSON.stringify(row.records).includes(memory.id), false);
      assert.equal(JSON.stringify(row.records).includes("financial-archive-order-key"), false);
      assert.equal((row.records.payment_orders as Array<unknown>).length, 1);
    } finally { await checkedArchive.end(); }
    await assert.rejects(
      archiveFinancialRecords({ deletionRequestId: randomUUID(), userId: user.id }, {
        ...process.env,
        ACCOUNT_DELETION_FINANCIAL_ARCHIVE_DATABASE_URL: appUrl,
      }),
      (error: unknown) => error instanceof FinancialArchiveConfigurationError && error.code === "FINANCIAL_ARCHIVE_DATABASE_NOT_ISOLATED",
    );
    await database.closePostgresPool();
  } finally {
    await app?.end();
    await admin.end();
  }
});
