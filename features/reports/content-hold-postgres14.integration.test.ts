import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const adminUrlValue = process.env.CONTENT_HOLD_POSTGRES_GATE_ADMIN_URL;
const databaseName = process.env.CONTENT_HOLD_POSTGRES_GATE_DATABASE ?? "content_hold_gate_022";
const sql = async (index: number) => { const prefix=`${String(index).padStart(3,"0")}_`; const file=(await readdir(new URL("../../database/migrations/",import.meta.url))).find((name)=>name.startsWith(prefix)); if(!file) throw new Error(`MIGRATION_${prefix}_NOT_FOUND`); return readFile(new URL(`../../database/migrations/${file}`,import.meta.url),"utf8"); };
const urlFor = (adminUrl:string, database:string) => { const url=new URL(adminUrl); url.pathname=`/${database}`; return url.toString(); };
async function reset(admin:InstanceType<typeof Client>, database:string) { assert.match(database,/^content_hold_gate_[a-z0-9_]+$/); await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()",[database]); await admin.query(`DROP DATABASE IF EXISTS "${database}"`); await admin.query(`CREATE DATABASE "${database}"`); }
async function noConnections(admin:InstanceType<typeof Client>, database:string) { assert.equal((await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()",[database])).rows[0]?.count,0); }

test("Migration 022 PostgreSQL 14 first-run, replay, rollback, postflight and connection-zero gate",{skip:adminUrlValue?false:"set CONTENT_HOLD_POSTGRES_GATE_ADMIN_URL to run isolated destructive PG14 gate",timeout:120_000},async()=>{
  assert.ok(adminUrlValue); const adminUrl=new URL(adminUrlValue); assert.match(adminUrl.hostname,/^(127\.0\.0\.1|localhost|::1)$/); assert.equal(process.env.CONTENT_HOLD_POSTGRES_GATE_ALLOW_DROP,"YES");
  const admin=new Client({connectionString:adminUrl.toString()}); await admin.connect(); let target:InstanceType<typeof Client>|undefined;
  try {
    assert.match((await admin.query<{server_version:string}>("SHOW server_version")).rows[0]?.server_version??"",/^14\./);
    await reset(admin,databaseName); target=new Client({connectionString:urlFor(adminUrlValue,databaseName)}); await target.connect();
    for(let i=1;i<=22;i+=1) await target.query(await sql(i)); await target.query(await sql(22)); await target.query(await readFile(new URL("../../database/verification/022-credible-impersonation-content-hold-postflight.sql",import.meta.url),"utf8"));
    assert.equal((await target.query("SELECT to_regclass('public.content_visibility_holds') AS value")).rows[0]?.value,"content_visibility_holds");
    assert.equal((await target.query("SELECT count(*)::int AS count FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid")).rows[0]?.count,0);
    assert.equal((await target.query("SELECT count(*)::int AS count FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated")).rows[0]?.count,0);
    await target.end(); target=undefined; await noConnections(admin,databaseName);
    const rollbackName=`${databaseName}_rollback`; await reset(admin,rollbackName); const rollback=new Client({connectionString:urlFor(adminUrlValue,rollbackName)}); await rollback.connect();
    try { for(let i=1;i<=21;i+=1) await rollback.query(await sql(i)); await assert.rejects(rollback.query((await sql(22)).replace(/COMMIT;\s*$/,"SELECT 1/0;\nCOMMIT;"))); await rollback.query("ROLLBACK"); assert.equal((await rollback.query("SELECT to_regclass('public.content_visibility_holds') AS value")).rows[0]?.value,null); } finally { await rollback.end(); }
    await noConnections(admin,rollbackName);
  } finally { await target?.end(); await admin.end(); }
});
