import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import pg from "pg";

const { Client } = pg;
const adminUrlValue = process.env.COMMERCE_REFUND_ENTITLEMENT_POSTGRES_GATE_ADMIN_URL;
const databaseName = process.env.COMMERCE_REFUND_ENTITLEMENT_POSTGRES_GATE_DATABASE ?? "commerce_refund_entitlement_gate_025";

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
  assert.match(database, /^commerce_refund_entitlement_gate_[a-z0-9_]+$/);
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()",
    [database],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
}

test("Migration 025 PostgreSQL 14 first-run, replay, rollback, postflight and connection-zero gate", {
  skip: adminUrlValue ? false : "set COMMERCE_REFUND_ENTITLEMENT_POSTGRES_GATE_ADMIN_URL to run isolated destructive PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  const adminUrl = new URL(adminUrlValue);
  assert.match(adminUrl.hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.equal(process.env.COMMERCE_REFUND_ENTITLEMENT_POSTGRES_GATE_ALLOW_DROP, "YES");
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  let target: InstanceType<typeof Client> | undefined;
  try {
    assert.match((await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "", /^14\./);
    await reset(admin, databaseName);
    target = new Client({ connectionString: databaseUrl(adminUrlValue, databaseName) });
    await target.connect();
    for (let index = 1; index <= 25; index += 1) await target.query(await migration(index));
    await target.query(await migration(25));
    await target.query(await readFile(new URL("../../database/verification/025-commerce-refund-entitlement-postflight.sql", import.meta.url), "utf8"));
    const validConstraint = await target.query<{ definition: string; validated: boolean }>(
      `SELECT pg_get_constraintdef(c.oid) AS definition, c.convalidated AS validated
         FROM pg_constraint c
        WHERE c.conrelid='public.commerce_refund_requests'::regclass
          AND c.conname='ck_commerce_refund_requests_reason'`,
    );
    assert.equal(validConstraint.rows[0]?.validated, true);
    assert.match(validConstraint.rows[0]?.definition ?? "", /entitlement_missing/);
    assert.equal((await target.query(
      "SELECT count(*)::int AS count FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid",
    )).rows[0]?.count, 0);
    assert.equal((await target.query(
      "SELECT count(*)::int AS count FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated",
    )).rows[0]?.count, 0);
    await target.end();
    target = undefined;
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [databaseName])).rows[0]?.count, 0);

    const rollbackName = `${databaseName}_rollback`;
    await reset(admin, rollbackName);
    const rollback = new Client({ connectionString: databaseUrl(adminUrlValue, rollbackName) });
    await rollback.connect();
    try {
      for (let index = 1; index <= 24; index += 1) await rollback.query(await migration(index));
      await assert.rejects(rollback.query((await migration(25)).replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;")));
      await rollback.query("ROLLBACK");
      const priorConstraint = await rollback.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c WHERE c.conrelid='public.commerce_refund_requests'::regclass AND c.conname='ck_commerce_refund_requests_reason'",
      );
      assert.doesNotMatch(priorConstraint.rows[0]?.definition ?? "", /entitlement_missing/);
    } finally {
      await rollback.end();
    }
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [rollbackName])).rows[0]?.count, 0);
  } finally {
    await target?.end();
    await admin.end();
  }
});
