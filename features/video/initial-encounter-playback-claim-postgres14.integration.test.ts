import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const adminUrl = process.env.INITIAL_ENCOUNTER_PG14_ADMIN_URL;
const database = process.env.INITIAL_ENCOUNTER_PG14_DATABASE ?? "initial_encounter_gate_026";
const dbUrl = (admin: string, name: string) => { const url = new URL(admin); url.pathname = `/${name}`; return url.toString(); };

async function migration(index: number): Promise<string> {
  const prefix = `${String(index).padStart(3, "0")}_`;
  const name = (await readdir(new URL("../../database/migrations/", import.meta.url))).find((candidate) => candidate.startsWith(prefix));
  if (!name) throw new Error(`MIGRATION_${prefix}_NOT_FOUND`);
  return readFile(new URL(`../../database/migrations/${name}`, import.meta.url), "utf8");
}

async function reset(admin: InstanceType<typeof Client>, name: string) {
  assert.match(name, /^initial_encounter_gate_[a-z0-9_]+$/);
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [name]);
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.query(`CREATE DATABASE "${name}"`);
}

test("Migration 026 PostgreSQL 14 first-run, replay, rollback, postflight and connection-zero gate", { skip: adminUrl ? false : "set INITIAL_ENCOUNTER_PG14_ADMIN_URL for isolated PG14 gate", timeout: 120_000 }, async () => {
  assert.ok(adminUrl); assert.equal(process.env.INITIAL_ENCOUNTER_PG14_ALLOW_DROP, "YES");
  const admin = new Client({ connectionString: adminUrl }); await admin.connect();
  let target: InstanceType<typeof Client> | undefined;
  try {
    assert.match((await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "", /^14\./);
    await reset(admin, database); target = new Client({ connectionString: dbUrl(adminUrl, database) }); await target.connect();
    for (let index = 1; index <= 26; index += 1) await target.query(await migration(index));
    await target.query(await migration(26));
    await target.query(await readFile(new URL("../../database/verification/026-initial-encounter-playback-claim-postflight.sql", import.meta.url), "utf8"));
    assert.equal((await target.query("SELECT count(*)::int AS count FROM pg_index WHERE NOT indisvalid")).rows[0]?.count, 0);
    await target.end(); target = undefined;
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [database])).rows[0]?.count, 0);

    const rollbackName = `${database}_rollback`; await reset(admin, rollbackName);
    const rollback = new Client({ connectionString: dbUrl(adminUrl, rollbackName) }); await rollback.connect();
    try {
      for (let index = 1; index <= 25; index += 1) await rollback.query(await migration(index));
      await assert.rejects(rollback.query((await migration(26)).replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;")));
      await rollback.query("ROLLBACK");
      assert.equal((await rollback.query("SELECT to_regclass('public.initial_encounter_playback_claims') AS table_name")).rows[0]?.table_name, null);
    } finally { await rollback.end(); }
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [rollbackName])).rows[0]?.count, 0);
  } finally { await target?.end(); await admin.end(); }
});
