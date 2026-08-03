import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import pg from "pg";

import { occasionRewardWindow } from "./occasion-rewards";

const { Client } = pg;
const adminUrlValue = process.env.COMMERCE_OCCASION_POSTGRES_GATE_ADMIN_URL;
const databaseName = process.env.COMMERCE_OCCASION_POSTGRES_GATE_DATABASE ?? "commerce_occasion_gate_020";

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
  assert.match(database, /^commerce_occasion_gate_[a-z0-9_]+$/);
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()",
    [database],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
}

test("Migration 020 PostgreSQL 14 first-run, replay, rollback, concurrent claim, expiry, postflight, and connection-zero gate", {
  skip: adminUrlValue ? false : "set COMMERCE_OCCASION_POSTGRES_GATE_ADMIN_URL to run isolated destructive PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  const adminUrl = new URL(adminUrlValue);
  assert.match(adminUrl.hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.equal(process.env.COMMERCE_OCCASION_POSTGRES_GATE_ALLOW_DROP, "YES");
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  let target: InstanceType<typeof Client> | undefined;
  let closePostgresPool: (() => Promise<void>) | undefined;
  try {
    assert.match((await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "", /^14\./);
    await reset(admin, databaseName);
    const targetUrl = databaseUrl(adminUrlValue, databaseName);
    target = new Client({ connectionString: targetUrl });
    await target.connect();
    for (let index = 1; index <= 20; index += 1) await target.query(await migration(index));
    await target.query(await migration(20));
    await target.query(await readFile(new URL("../../database/verification/020-commerce-occasion-postflight.sql", import.meta.url), "utf8"));
    assert.equal((await target.query("SELECT to_regclass('public.commerce_occasion_rewards') AS value")).rows[0]?.value, "commerce_occasion_rewards");
    assert.equal((await target.query(
      "SELECT count(*)::int AS count FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid",
    )).rows[0]?.count, 0);
    assert.equal((await target.query(
      "SELECT count(*)::int AS count FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated",
    )).rows[0]?.count, 0);

    process.env.DATABASE_URL = targetUrl;
    process.env.DATABASE_SSL = "false";
    process.env.DATABASE_POOL_MAX = "4";
    const [{ CommercePostgresDataSource }, database] = await Promise.all([
      import("./commerce-postgres-datasource"),
      import("@/src/server/database"),
    ]);
    closePostgresPool = database.closePostgresPool;
    const now = new Date();
    const chinaParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const chinaPart = (type: Intl.DateTimeFormatPartTypes) => chinaParts.find((part) => part.type === type)?.value;
    const birthday = `1990-${chinaPart("month")}-${chinaPart("day")}`;
    const birthdayWindow = occasionRewardWindow("birthday", birthday, now);
    assert.ok(birthdayWindow);
    const externalUserId = "pg14-occasion-owner";
    const user = (await target.query<{ id: string }>(
      "INSERT INTO users(external_id, profile) VALUES ($1, $2::jsonb) RETURNING id",
      [externalUserId, JSON.stringify({ birth_date: birthday })],
    )).rows[0]!;
    const memory = (await target.query<{ id: string }>(
      "INSERT INTO memories(user_id, name, idempotency_key, creation_idempotency_key) VALUES ($1, 'Occasion gate TA', $2, $3) RETURNING id",
      [user.id, "a".repeat(64), "b".repeat(64)],
    )).rows[0]!;
    const commerce = new CommercePostgresDataSource();
    const [first, replay] = await Promise.all([
      commerce.claimOccasionReward({ externalUserId, requestKey: "occasion-gate-claim-0001", occasion: "birthday", now }),
      commerce.claimOccasionReward({ externalUserId, requestKey: "occasion-gate-claim-0002", occasion: "birthday", now }),
    ]);
    assert.equal(first.calendarYear, birthdayWindow.calendarYear);
    assert.deepEqual(replay, first);
    assert.equal((await target.query("SELECT count(*)::int AS count FROM commerce_occasion_rewards WHERE user_id=$1", [user.id])).rows[0]?.count, 1);
    const offers = await commerce.listOpenOccasionRewardOffers({ externalUserId, now });
    assert.deepEqual(offers.find((offer) => offer.occasion === "birthday"), {
      occasion: "birthday",
      calendarYear: birthdayWindow.calendarYear,
      eligibleOn: birthdayWindow.eligibleOn,
      claimDeadline: birthdayWindow.claimDeadline,
      claimed: true,
    });
    const failed = await commerce.reserveGeneration({
      externalUserId, memoryId: memory.id, requestKey: "occasion-gate-reserve-0001", generationKey: "occasion-gate-generation-0001", purpose: "occasion_experience",
    });
    assert.equal(failed.sourceKind, "occasion_reward");
    assert.equal(failed.saveAllowed, true);
    assert.equal((await commerce.settleGeneration({ externalUserId, requestKey: failed.requestKey, outcome: "system_failed" })).status, "released");
    assert.equal((await commerce.getCreditBalance(externalUserId)).occasionAvailable, 1);
    const consumed = await commerce.reserveGeneration({
      externalUserId, memoryId: memory.id, requestKey: "occasion-gate-reserve-0002", generationKey: "occasion-gate-generation-0002", purpose: "occasion_experience",
    });
    assert.equal((await commerce.settleGeneration({ externalUserId, requestKey: consumed.requestKey, outcome: "succeeded" })).status, "consumed");
    assert.equal((await commerce.getCreditBalance(externalUserId)).occasionAvailable, 0);
    await assert.rejects(target.query(
      "INSERT INTO commerce_credit_lots(user_id, source_kind, source_key, total_credits, save_allowed) VALUES ($1, 'occasion_reward', 'invalid-expiry', 1, true)",
      [user.id],
    ));
    assert.equal((await target.query("SELECT count(*)::int AS count FROM commerce_credit_lots WHERE source_key='invalid-expiry'", [])).rows[0]?.count, 0);

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
      for (let index = 1; index <= 19; index += 1) await rollback.query(await migration(index));
      await assert.rejects(rollback.query((await migration(20)).replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;")));
      await rollback.query("ROLLBACK");
      assert.equal((await rollback.query("SELECT to_regclass('public.commerce_occasion_rewards') AS value")).rows[0]?.value, null);
    } finally {
      await rollback.end();
    }
  } finally {
    await closePostgresPool?.();
    await target?.end();
    await admin.end();
  }
});
