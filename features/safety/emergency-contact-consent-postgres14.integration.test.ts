import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import pg from "pg";

const { Client } = pg;
const adminUrlValue = process.env.EMERGENCY_CONTACT_POSTGRES_GATE_ADMIN_URL;
const databaseName = process.env.EMERGENCY_CONTACT_POSTGRES_GATE_DATABASE ?? "emergency_contact_gate_024";

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
  assert.match(database, /^emergency_contact_gate_[a-z0-9_]+$/);
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [database]);
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
}

async function assertNoConnections(admin: InstanceType<typeof Client>, database: string): Promise<void> {
  assert.equal((await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [database])).rows[0]?.count, 0);
}

test("Migration 024 PostgreSQL 14 first-run, replay, rollback, consent lifecycle, postflight and connection-zero gate", {
  skip: adminUrlValue ? false : "set EMERGENCY_CONTACT_POSTGRES_GATE_ADMIN_URL to run isolated destructive PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  const adminUrl = new URL(adminUrlValue);
  assert.match(adminUrl.hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.equal(process.env.EMERGENCY_CONTACT_POSTGRES_GATE_ALLOW_DROP, "YES");
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  let target: InstanceType<typeof Client> | undefined;
  try {
    assert.match((await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "", /^14\./);
    await reset(admin, databaseName);
    target = new Client({ connectionString: databaseUrl(adminUrlValue, databaseName) });
    await target.connect();
    for (let index = 1; index <= 24; index += 1) await target.query(await migration(index));
    await target.query(await migration(24));
    await target.query(await readFile(new URL("../../database/verification/024-emergency-contact-consent-postflight.sql", import.meta.url), "utf8"));

    const owner = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pg14-contact-owner') RETURNING id")).rows[0]!;
    const contact = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pg14-contact-recipient') RETURNING id")).rows[0]!;
    const consent = (await target.query<{ id: string }>("INSERT INTO crisis_contact_consents(owner_user_id, contact_user_id) VALUES ($1,$2) RETURNING id", [owner.id, contact.id])).rows[0]!;
    await assert.rejects(target.query("INSERT INTO crisis_contact_consents(owner_user_id, contact_user_id) VALUES ($1,$1)", [owner.id]));
    await assert.rejects(target.query("UPDATE crisis_contact_consents SET status='accepted' WHERE id=$1", [consent.id]));
    await target.query("UPDATE crisis_contact_consents SET status='accepted', accepted_at=NOW() WHERE id=$1", [consent.id]);
    await target.query("UPDATE crisis_contact_consents SET status='revoked', revoked_at=NOW() WHERE id=$1", [consent.id]);
    assert.equal((await target.query("SELECT status FROM crisis_contact_consents WHERE id=$1", [consent.id])).rows[0]?.status, "revoked");
    assert.equal((await target.query("SELECT count(*)::int AS count FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid")).rows[0]?.count, 0);
    assert.equal((await target.query("SELECT count(*)::int AS count FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated")).rows[0]?.count, 0);
    await target.end();
    target = undefined;
    await assertNoConnections(admin, databaseName);

    const rollbackName = `${databaseName}_rollback`;
    await reset(admin, rollbackName);
    const rollback = new Client({ connectionString: databaseUrl(adminUrlValue, rollbackName) });
    await rollback.connect();
    try {
      for (let index = 1; index <= 23; index += 1) await rollback.query(await migration(index));
      await assert.rejects(rollback.query((await migration(24)).replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;")));
      await rollback.query("ROLLBACK");
      assert.equal((await rollback.query("SELECT to_regclass('public.crisis_contact_consents') AS value")).rows[0]?.value, null);
    } finally {
      await rollback.end();
    }
    await assertNoConnections(admin, rollbackName);
  } finally {
    await target?.end();
    await admin.end();
  }
});
