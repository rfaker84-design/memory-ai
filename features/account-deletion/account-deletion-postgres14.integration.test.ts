import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const adminUrlValue = process.env.ACCOUNT_DELETION_POSTGRES_GATE_ADMIN_URL;
const databaseName = process.env.ACCOUNT_DELETION_POSTGRES_GATE_DATABASE ?? "account_deletion_gate_017";
const migrations = Array.from({ length: 17 }, (_, index) => `${String(index + 1).padStart(3, "0")}_`);

function gateUrl(adminUrl: string, database: string): string { const url = new URL(adminUrl); url.pathname = `/${database}`; return url.toString(); }
async function migration(index: number): Promise<string> {
  const names = await import("node:fs/promises").then(({ readdir }) => readdir(new URL("../../database/migrations/", import.meta.url)));
  const name = names.find((candidate) => candidate.startsWith(migrations[index]));
  if (!name) throw new Error("MIGRATION_NOT_FOUND");
  return readFile(new URL(`../../database/migrations/${name}`, import.meta.url), "utf8");
}
async function reset(admin: InstanceType<typeof Client>, database: string): Promise<void> {
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [database]);
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
}

test("Migration 017 PostgreSQL 14 first-run, replay, rollback, hold and concurrent-request gate", {
  skip: adminUrlValue ? false : "set ACCOUNT_DELETION_POSTGRES_GATE_ADMIN_URL to run isolated destructive PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  assert.match(new URL(adminUrlValue).hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.match(databaseName, /^account_deletion_gate_[a-z0-9_]+$/);
  const admin = new Client({ connectionString: adminUrlValue });
  await admin.connect();
  try {
    const version = (await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "";
    assert.match(version, /^14\./);
    await reset(admin, databaseName);
    const target = new Client({ connectionString: gateUrl(adminUrlValue, databaseName) });
    await target.connect();
    try {
      for (let index = 0; index < 17; index += 1) await target.query(await migration(index));
      await target.query(await migration(16));
      assert.equal((await target.query("SELECT to_regclass('public.account_deletion_requests') AS value")).rows[0]?.value, "account_deletion_requests");
      const user = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pg14-delete-user') RETURNING id")).rows[0]!;
      await assert.rejects(target.query(`INSERT INTO account_deletion_requests(user_id,content_delete_after,provider_delete_after,backup_expire_after,receipt_access_hash,receipt_access_expires_at,legal_hold,legal_hold_reason,legal_hold_scope,legal_hold_approved_by,legal_hold_expires_at) VALUES ($1,NOW(),NOW(),NOW(),'x',NOW(),true,NULL,NULL,NULL,NULL)`, [user.id]));
      await target.query(`INSERT INTO account_deletion_requests(user_id,content_delete_after,provider_delete_after,backup_expire_after,receipt_access_hash,receipt_access_expires_at) VALUES ($1,NOW(),NOW(),NOW(),'x',NOW())`, [user.id]);
      await assert.rejects(target.query(`INSERT INTO account_deletion_requests(user_id,content_delete_after,provider_delete_after,backup_expire_after,receipt_access_hash,receipt_access_expires_at) VALUES ($1,NOW(),NOW(),NOW(),'y',NOW())`, [user.id]));
    } finally { await target.end(); }
    const rollbackName = `${databaseName}_rollback`;
    await reset(admin, rollbackName);
    const rollback = new Client({ connectionString: gateUrl(adminUrlValue, rollbackName) });
    await rollback.connect();
    try {
      for (let index = 0; index < 16; index += 1) await rollback.query(await migration(index));
      await assert.rejects(rollback.query((await migration(16)).replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;")));
      await rollback.query("ROLLBACK");
      assert.equal((await rollback.query("SELECT to_regclass('public.account_deletion_requests') AS value")).rows[0]?.value, null);
    } finally { await rollback.end(); }
  } finally { await admin.end(); }
});
