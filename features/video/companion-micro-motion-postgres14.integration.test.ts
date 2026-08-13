import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import pg from "pg";

import type { OwnerVideoInputStagingPort } from "./first-presence-video-owner-api";

const { Client } = pg;
const adminUrlValue = process.env.COMPANION_MOTION_PG14_ADMIN_URL;
const gateDatabase = process.env.COMPANION_MOTION_PG14_DATABASE
  ?? "companion_motion_gate_028";
const rollbackDatabase = `${gateDatabase}_rollback`;
const gateApplicationName = "memoryai-companion-motion-pg14-gate";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function databaseUrl(adminUrl: URL, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  url.searchParams.set("application_name", gateApplicationName);
  return url.toString();
}

async function migration(index: number): Promise<string> {
  const prefix = `${String(index).padStart(3, "0")}_`;
  const names = await readdir(new URL("../../database/migrations/", import.meta.url));
  const name = names.find((candidate) => candidate.startsWith(prefix));
  if (!name) throw new Error(`MIGRATION_${prefix}_NOT_FOUND`);
  return readFile(new URL(`../../database/migrations/${name}`, import.meta.url), "utf8");
}

async function applyThrough(client: InstanceType<typeof Client>, last: number): Promise<void> {
  for (let index = 1; index <= last; index += 1) {
    // 018 is a separately governed financial-archive database migration and
    // must never be part of an application-database fixture.
    if (index === 18) continue;
    await client.query(await migration(index));
  }
}

async function reset(admin: InstanceType<typeof Client>, database: string): Promise<void> {
  assert.match(database, /^companion_motion_gate_[a-z0-9_]+$/);
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()",
    [database],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
}

test("Migration 028 PostgreSQL 14 entitlement, review-grant, ownership, concurrency and replay gate", {
  skip: adminUrlValue
    ? false
    : "set COMPANION_MOTION_PG14_ADMIN_URL for the isolated destructive PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  const adminUrl = new URL(adminUrlValue);
  assert.match(adminUrl.hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.equal(process.env.COMPANION_MOTION_PG14_ALLOW_DROP, "YES");

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  let target: InstanceType<typeof Client> | undefined;
  let closePostgresPool: (() => Promise<void>) | undefined;
  try {
    assert.match(
      (await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "",
      /^14\./,
    );
    await reset(admin, gateDatabase);
    await reset(admin, rollbackDatabase);

    const targetUrl = databaseUrl(adminUrl, gateDatabase);
    target = new Client({ connectionString: targetUrl });
    await target.connect();
    await applyThrough(target, 28);
    await target.query(await migration(28));
    assert.equal(
      (await target.query(
        "SELECT to_regnamespace('financial_archive') AS value",
      )).rows[0]?.value,
      null,
      "the app database fixture must not apply the independently governed Migration 018",
    );

    assert.equal(
      (await target.query(
        "SELECT count(*)::int AS count FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid",
      )).rows[0]?.count,
      0,
    );
    assert.equal(
      (await target.query(
        "SELECT count(*)::int AS count FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated",
      )).rows[0]?.count,
      0,
    );

    const rollback = new Client({ connectionString: databaseUrl(adminUrl, rollbackDatabase) });
    await rollback.connect();
    try {
      await applyThrough(rollback, 27);
      assert.equal(
        (await rollback.query(
          "SELECT to_regnamespace('financial_archive') AS value",
        )).rows[0]?.value,
        null,
      );
      await assert.rejects(
        rollback.query((await migration(28)).replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;")),
      );
      await rollback.query("ROLLBACK");
      assert.equal(
        (await rollback.query(
          "SELECT to_regclass('public.companion_motion_review_grants') AS value",
        )).rows[0]?.value,
        null,
      );
      assert.equal(
        (await rollback.query(
          "SELECT count(*)::int AS count FROM pg_attribute WHERE attrelid='public.video_generation_jobs'::regclass AND attname='use_case' AND NOT attisdropped",
        )).rows[0]?.count,
        0,
      );
    } finally {
      await rollback.end();
    }

    const ownerExternalId = `phone:${digest("companion-motion-owner")}`;
    const otherExternalId = `phone:${digest("companion-motion-other")}`;
    const users = await target.query<{ id: string; external_id: string }>(
      "INSERT INTO users(external_id) VALUES ($1),($2) RETURNING id, external_id",
      [ownerExternalId, otherExternalId],
    );
    const ownerId = users.rows.find((row) => row.external_id === ownerExternalId)?.id;
    const otherId = users.rows.find((row) => row.external_id === otherExternalId)?.id;
    assert.ok(ownerId && otherId);

    const ownerMemory = (await target.query<{ id: string }>(
      `INSERT INTO memories(user_id,name,idempotency_key,creation_idempotency_key)
       VALUES ($1,'Owner TA',$2,$3) RETURNING id`,
      [ownerId, digest("companion-owner-memory"), "companion:owner:memory:0001"],
    )).rows[0]!.id;
    const ownerOtherMemory = (await target.query<{ id: string }>(
      `INSERT INTO memories(user_id,name,idempotency_key,creation_idempotency_key)
       VALUES ($1,'Owner other TA',$2,$3) RETURNING id`,
      [ownerId, digest("companion-owner-other-memory"), "companion:owner:memory:0002"],
    )).rows[0]!.id;
    const otherMemory = (await target.query<{ id: string }>(
      `INSERT INTO memories(user_id,name,idempotency_key,creation_idempotency_key)
       VALUES ($1,'Other owner TA',$2,$3) RETURNING id`,
      [otherId, digest("companion-other-memory"), "companion:other:memory:0001"],
    )).rows[0]!.id;

    for (const [userId, memoryId, suffix] of [
      [ownerId, ownerMemory, "owner"],
      [ownerId, ownerOtherMemory, "owner-other"],
      [otherId, otherMemory, "other"],
    ] as const) {
      await target.query(
        `INSERT INTO media_assets(
           user_id,memory_id,media_type,storage_key,mime_type,size_bytes,
           sha256,status,metadata
         ) VALUES ($1,$2,'image',$3,'image/jpeg',42,$4,'uploaded',$5::jsonb)`,
        [
          userId,
          memoryId,
          `media/companion-motion/${suffix}.jpg`,
          digest(`companion-portrait-${suffix}`),
          JSON.stringify({ qualityPreflightStatus: "passed" }),
        ],
      );
    }

    const stagedJobIds = new Set<string>();
    const stagedProviderInputs = new Map<string, string>();
    const discardedJobIds = new Set<string>();
    let derivedInputCalls = 0;
    const staging: OwnerVideoInputStagingPort = {
      async stage(input) {
        assert.equal(input.storageKey, undefined);
        assert.match(input.imageDataUrl ?? "", /^data:image\/jpeg;base64,/);
        stagedJobIds.add(input.jobId);
        stagedProviderInputs.set(input.jobId, input.imageDataUrl!);
      },
      async prepareCompanionMotionInput() {
        derivedInputCalls += 1;
        return {
          imageDataUrl: "data:image/jpeg;base64,Y29tcGFuaW9uLW1vdGlvbi1mcmFtZQ==",
          inputSha256: digest("companion-motion-derived-frame"),
        };
      },
      async discard(input) { discardedJobIds.add(input.jobId); },
    };

    process.env.DATABASE_URL = targetUrl;
    process.env.DATABASE_SSL = "false";
    process.env.DATABASE_POOL_MAX = "32";
    const [{ CompanionMotionPackError, CompanionMotionPackService }, database] = await Promise.all([
      import("./companion-micro-motion"),
      import("../../src/server/database"),
    ]);
    closePostgresPool = database.closePostgresPool;
    const disabled = new CompanionMotionPackService(
      () => staging,
      {
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "staging",
        YIJIAN_COMPANION_MOTION_STAGING_REVIEW_ENABLED: "false",
      },
    );
    const enabled = new CompanionMotionPackService(
      () => staging,
      {
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "staging",
        YIJIAN_COMPANION_MOTION_STAGING_REVIEW_ENABLED: "true",
      },
    );

    await target.query(
      `INSERT INTO companion_motion_review_grants(
         user_id,memory_id,grant_key,granted_by,reason,starts_at,expires_at
       ) VALUES ($1,$2,$3,$4,$5,NOW()-INTERVAL '1 minute',NOW()+INTERVAL '1 hour')`,
      [
        ownerId,
        ownerMemory,
        "companion-review-grant-0001",
        "owner-review@yijian.test",
        "isolated PG14 visual-review grant",
      ],
    );

    assert.deepEqual(await disabled.getState({
      externalUserId: ownerExternalId,
      memoryId: ownerMemory,
    }), { eligible: false, slots: [] });
    await assert.rejects(
      disabled.ensure({ externalUserId: ownerExternalId, memoryId: ownerMemory }),
      (error: unknown) => error instanceof CompanionMotionPackError
        && error.code === "ACTIVE_ENTITLEMENT_REQUIRED",
    );
    assert.equal(
      (await target.query(
        "SELECT count(*)::int AS count FROM video_generation_jobs WHERE use_case='companion_micro_motion'",
      )).rows[0]?.count,
      0,
    );

    const paidOrderId = (await target.query<{ id: string }>(
      `INSERT INTO commerce_orders(
         user_id,order_no,request_key,product_id,platform,payment_rail,
         amount_fen,generation_credits,status,provider_transaction_id,paid_at
       ) VALUES (
         $1,'YC20260812000000ABCDEF123456','companion:paid:order:0001',
         'memory_video_49','web','test',4900,2,'paid','companion-paid-tx-0001',NOW()
       ) RETURNING id`,
      [otherId],
    )).rows[0]!.id;
    await target.query(
      `INSERT INTO commerce_credit_lots(
         user_id,source_kind,source_key,total_credits,reserved_credits,
         consumed_credits,save_allowed,active
       ) VALUES ($1,'paid_package',$2,2,0,2,true,true)`,
      [otherId, paidOrderId],
    );
    assert.deepEqual(await disabled.getState({
      externalUserId: otherExternalId,
      memoryId: otherMemory,
    }), { eligible: true, slots: [] }, "a current paid package remains eligible even after its video credits are consumed");
    await target.query(
      "UPDATE commerce_orders SET status='refunded',refunded_at=NOW() WHERE id=$1",
      [paidOrderId],
    );
    await target.query(
      "UPDATE commerce_credit_lots SET active=false WHERE source_kind='paid_package' AND source_key=$1::text",
      [paidOrderId],
    );
    assert.deepEqual(await disabled.getState({
      externalUserId: otherExternalId,
      memoryId: otherMemory,
    }), { eligible: false, slots: [] }, "a refunded package cannot grant motion access");

    const concurrent = await Promise.all(Array.from({ length: 24 }, () => enabled.ensure({
      externalUserId: ownerExternalId,
      memoryId: ownerMemory,
    })));
    assert.equal(concurrent.every((pack) => pack.length === 3), true);
    assert.equal(
      new Set(concurrent.flatMap((pack) => pack.map((slot) => slot.jobId))).size,
      3,
    );
    assert.deepEqual(
      [...new Set(concurrent.flatMap((pack) => pack.map((slot) => slot.variant)))].sort(),
      ["attentive", "idle", "reflective"],
    );
    assert.equal(stagedJobIds.size, 3);
    assert.equal(stagedProviderInputs.size, 3);
    assert.equal(derivedInputCalls, 1, "one portrait read produces the three v2 provider inputs");
    assert.equal(discardedJobIds.size, 0);
    assert.equal(
      (await target.query(
        "SELECT count(*)::int AS count FROM video_generation_jobs WHERE user_id=$1 AND memory_id=$2 AND use_case='companion_micro_motion'",
        [ownerId, ownerMemory],
      )).rows[0]?.count,
      3,
    );

    // A v1 output-shape rejection is immutable. It only unlocks a separate
    // v2 pack that stages three private 9:16 inputs for this same owner/person.
    await target.query(
      `UPDATE video_generation_jobs
       SET pack_version=1,
           idempotency_key='companion-motion.v1.' || motion_variant,
           status='rejected', provider_submission_state='accepted',
           provider_task_id='vidu-resolution-rejected-' || id::text, provider_state='success',
           quality_status='rejected', entitlement_settlement='released', error_code='MEDIA_RESOLUTION_INVALID'
       WHERE user_id=$1 AND memory_id=$2 AND use_case='companion_micro_motion' AND pack_version=2`,
      [ownerId, ownerMemory],
    );
    const upgraded = await enabled.ensure({ externalUserId: ownerExternalId, memoryId: ownerMemory });
    assert.equal(upgraded.length, 3);
    assert.equal(stagedJobIds.size, 6, "the v2 pack stages three new provider-only inputs exactly once");
    assert.equal(derivedInputCalls, 2, "the retried v2 pack derives one private source for all three slots");
    assert.deepEqual(
      (await target.query<{ pack_version: number; count: number }>(
        `SELECT pack_version, count(*)::int AS count
         FROM video_generation_jobs
         WHERE user_id=$1 AND memory_id=$2 AND use_case='companion_micro_motion'
         GROUP BY pack_version ORDER BY pack_version`,
        [ownerId, ownerMemory],
      )).rows,
      [{ pack_version: 1, count: 3 }, { pack_version: 2, count: 3 }],
    );
    assert.deepEqual(
      (await target.query<{ input_sha256: string }>(
        `SELECT input_sha256 FROM video_generation_jobs
         WHERE user_id=$1 AND memory_id=$2 AND use_case='companion_micro_motion' AND pack_version=2`,
        [ownerId, ownerMemory],
      )).rows,
      Array.from({ length: 3 }, () => ({ input_sha256: digest("companion-motion-derived-frame") })),
      "every v2 slot references the same private derived source, never the original upload",
    );
    assert.deepEqual(
      (await target.query<{ status: string; error_code: string | null }>(
        `SELECT status, error_code FROM video_generation_jobs
         WHERE user_id=$1 AND memory_id=$2 AND use_case='companion_micro_motion' AND pack_version=1`,
        [ownerId, ownerMemory],
      )).rows,
      Array.from({ length: 3 }, () => ({ status: "rejected", error_code: "MEDIA_RESOLUTION_INVALID" })),
    );

    const refreshed = await Promise.all([
      enabled.ensure({ externalUserId: ownerExternalId, memoryId: ownerMemory }),
      enabled.list({ externalUserId: ownerExternalId, memoryId: ownerMemory }),
      enabled.getState({ externalUserId: ownerExternalId, memoryId: ownerMemory }),
    ]);
    assert.equal(refreshed[0].length, 3);
    assert.equal(refreshed[1].length, 3);
    assert.deepEqual(refreshed[2], { eligible: true, slots: refreshed[1] });
    assert.equal(stagedJobIds.size, 6, "refresh and replay never restage or create a seventh slot");
    assert.equal(
      (await target.query(
        "SELECT count(*)::int AS count FROM video_generation_jobs WHERE use_case='companion_micro_motion'",
      )).rows[0]?.count,
      6,
    );

    for (const denied of [
      { externalUserId: otherExternalId, memoryId: ownerMemory },
      { externalUserId: ownerExternalId, memoryId: otherMemory },
      { externalUserId: ownerExternalId, memoryId: ownerOtherMemory },
    ]) {
      await assert.rejects(
        enabled.ensure(denied),
        (error: unknown) => error instanceof CompanionMotionPackError
          && error.code === "ACTIVE_ENTITLEMENT_REQUIRED",
      );
    }
    assert.equal(
      (await target.query(
        "SELECT count(*)::int AS count FROM video_generation_jobs WHERE use_case='companion_micro_motion'",
      )).rows[0]?.count,
      6,
    );

    await target.query(
      "UPDATE companion_motion_review_grants SET expires_at=NOW()-INTERVAL '1 second' WHERE user_id=$1 AND memory_id=$2",
      [ownerId, ownerMemory],
    );
    assert.deepEqual(await enabled.getState({
      externalUserId: ownerExternalId,
      memoryId: ownerMemory,
    }), { eligible: false, slots: [] });
    await assert.rejects(
      enabled.ensure({ externalUserId: ownerExternalId, memoryId: ownerMemory }),
      (error: unknown) => error instanceof CompanionMotionPackError
        && error.code === "ACTIVE_ENTITLEMENT_REQUIRED",
    );
    assert.equal(
      (await target.query(
        "SELECT count(*)::int AS count FROM video_generation_jobs WHERE use_case='companion_micro_motion'",
      )).rows[0]?.count,
      6,
    );

    await closePostgresPool();
    closePostgresPool = undefined;
    await target.end();
    target = undefined;
    assert.equal(
      (await admin.query(
        "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()",
        [gateDatabase],
      )).rows[0]?.count,
      0,
    );
  } finally {
    await closePostgresPool?.();
    await target?.end();
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=ANY($1::text[]) AND pid <> pg_backend_pid()",
      [[gateDatabase, rollbackDatabase]],
    ).catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS "${gateDatabase}"`).catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS "${rollbackDatabase}"`).catch(() => undefined);
    await admin.end();
  }
});
