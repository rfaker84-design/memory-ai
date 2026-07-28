import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import pg from "pg";

import { closePostgresPool } from "../../src/server/database";
import { getCommerceProduct } from "../commerce/catalog";
import { CommercePostgresDataSource } from "../commerce/commerce-postgres-datasource";
import {
  FirstPresenceCommerceEntitlementPort,
  FirstPresenceVideoPostgresRepository,
} from "./first-presence-video-postgres";
import { FirstPresenceVideoService } from "./first-presence-video-service";
import { ViduFirstPresenceNetworkError } from "./vidu-first-presence-provider";

const { Client } = pg;
const gateApplicationName = "memoryai-video-pg14-gate";
const adminUrlValue = process.env.VIDEO_POSTGRES_GATE_ADMIN_URL;
const gateDatabase = process.env.VIDEO_POSTGRES_GATE_DATABASE ?? "video_gate_migration016";
const rollbackDatabase = `${gateDatabase}_rollback`;
const migrations = [
  "001_memoryai_core.sql", "002_memoryai_indexes.sql", "003_memoryai_constraints.sql",
  "004_media_storage_foundation.sql", "005_memory_creation_idempotency.sql",
  "006_auth_verification_challenges.sql", "007_long_term_memories.sql",
  "008_memory_first_greetings.sql", "009_memory_chat_turn_idempotency.sql",
  "010_memory_experience_payments.sql", "011_business_funnel_events.sql",
  "012_payment_refund_requests.sql", "013_wechat_auth_identities.sql",
  "014_commerce_credits_referrals.sql", "015_chat_default_session_atomicity.sql",
  "016_video_job_postgres_ledger.sql",
];

function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function databaseUrl(adminUrl: URL, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  url.searchParams.set("application_name", gateApplicationName);
  return url.toString();
}
function assertGate(adminUrl: URL): void {
  assert.match(adminUrl.hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.match(gateDatabase, /^video_gate_[a-z0-9_]+$/);
  assert.equal(process.env.VIDEO_POSTGRES_GATE_ALLOW_DROP, "YES");
}
async function reset(admin: InstanceType<typeof Client>, database: string): Promise<void> {
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [database]);
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
}
async function migration(index: number): Promise<string> {
  return readFile(new URL(`../../database/migrations/${migrations[index]}`, import.meta.url), "utf8");
}
async function apply(client: InstanceType<typeof Client>, until = migrations.length): Promise<void> {
  for (let index = 0; index < until; index += 1) await client.query(await migration(index));
}

/** Tracks every real pg.Client so every success and failure path closes it. */
class GateConnections {
  private readonly clients = new Set<InstanceType<typeof Client>>();

  open(connectionString: string): InstanceType<typeof Client> {
    const client = new Client({ connectionString });
    this.clients.add(client);
    return client;
  }

  async close(client: InstanceType<typeof Client>): Promise<void> {
    if (!this.clients.delete(client)) return;
    await client.end();
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.clients].map((client) => this.close(client)));
  }
}

test("Migration 016 isolated PostgreSQL 14 video ledger gate", {
  skip: adminUrlValue ? false : "set VIDEO_POSTGRES_GATE_ADMIN_URL to run the destructive isolated PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  const adminUrl = new URL(adminUrlValue);
  assertGate(adminUrl);
  const connections = new GateConnections();
  try {
  const admin = connections.open(adminUrl.toString());
  await admin.connect();
  await reset(admin, gateDatabase);
  await reset(admin, rollbackDatabase);
  const version = (await admin.query<{ server_version: string }>("SELECT current_setting('server_version') AS server_version")).rows[0].server_version;
  assert.match(version, /^14\./, "gate requires PostgreSQL 14");
  await connections.close(admin);

  const targetUrl = databaseUrl(adminUrl, gateDatabase);
  const target = connections.open(targetUrl);
  await target.connect();
  await apply(target);
  await target.query(await migration(15)); // replay contract
  await target.query(await readFile(new URL("../../database/verification/016-video-job-postgres-ledger-postflight.sql", import.meta.url), "utf8"));

  const rollback = connections.open(databaseUrl(adminUrl, rollbackDatabase));
  await rollback.connect();
  await apply(rollback, 15);
  await assert.rejects(rollback.query((await migration(15)).replace(/COMMIT;\s*$/, "SELECT 1 / 0;\nCOMMIT;\n")));
  await rollback.query("ROLLBACK");
  assert.equal((await rollback.query("SELECT to_regclass('public.video_generation_jobs') AS job")).rows[0].job, null, "failed 016 rolls back all video tables");
  await connections.close(rollback);

  const owner = `phone:${sha("video-gate-owner")}`;
  const other = `phone:${sha("video-gate-other")}`;
  await target.query("INSERT INTO public.users (external_id) VALUES ($1), ($2)", [owner, other]);
  const users = await target.query<{ id: string; external_id: string }>("SELECT id, external_id FROM public.users WHERE external_id = ANY($1::text[])", [[owner, other]]);
  const ownerId = users.rows.find((row) => row.external_id === owner)?.id;
  const otherId = users.rows.find((row) => row.external_id === other)?.id;
  assert.ok(ownerId && otherId);
  const memory = (await target.query<{ id: string }>(
    `INSERT INTO public.memories (user_id, name, idempotency_key, creation_idempotency_key)
     VALUES ($1, 'PG14 video TA', $2, $3) RETURNING id`, [ownerId, sha("video-gate-memory"), "video:gate:memory:0001"]
  )).rows[0].id;
  const otherMemory = (await target.query<{ id: string }>(
    `INSERT INTO public.memories (user_id, name, idempotency_key, creation_idempotency_key)
     VALUES ($1, 'Other TA', $2, $3) RETURNING id`, [otherId, sha("video-gate-other-memory"), "video:gate:other:0001"]
  )).rows[0].id;
  await connections.close(target);

  Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: targetUrl, DATABASE_SSL: "false", DATABASE_POOL_MAX: "24" });
  const commerce = new CommercePostgresDataSource();
  const product = getCommerceProduct("memory_video_99");
  const order = await commerce.createOrder({ externalUserId: owner, requestKey: "video:gate:order:0001", product, platform: "web", paymentRail: "test" });
  await commerce.applyPaymentEvent("test", { eventId: "video-gate-payment-0001", kind: "payment", orderNo: order.orderNo, transactionId: "video-gate-transaction-0001", status: "succeeded", amountFen: product.priceFen, payloadHash: sha("video-gate-payment") });

  let submits = 0;
  let mode: "success" | "failed" | "lost" = "success";
  const provider = {
    submit: async () => {
      submits += 1;
      if (mode === "lost") throw new ViduFirstPresenceNetworkError();
      return { taskId: `task-${submits}`, providerState: "created", credits: 44 };
    },
    poll: async (taskId: string) => mode === "failed"
      ? { state: "failed" as const, providerState: "failed", credits: 44, errorCode: "PROVIDER_FAILED" }
      : { state: "succeeded" as const, providerState: "success", credits: 44, outputUrl: `https://example.test/${taskId}.mp4` },
  };
  const createService = () => new FirstPresenceVideoService(
    new FirstPresenceVideoPostgresRepository(), provider, new FirstPresenceCommerceEntitlementPort(commerce),
    { download: async ({ jobId }) => ({ artifactKey: `video/${jobId}.mp4`, body: Buffer.from("video") }) },
    {
      inspect: async () => ({
        durationSeconds: 8,
        width: 1080,
        height: 1920,
        codec: "h264",
        hasAudio: false,
        sizeBytes: 5,
        decodable: true,
        evidence: {
          firstFramePath: "evidence/first.jpg",
          actionFramePath: "evidence/action.jpg",
          finalFramePath: "evidence/final.jpg",
        },
      }),
    },
    { assertCanReview: ({ reviewerAccount }) => {
      if (reviewerAccount !== "video-reviewer@yijian.test") throw new Error("FIRST_PRESENCE_REVIEW_UNAUTHORIZED");
    } },
  );
  const input = { externalUserId: owner, memoryId: memory!, idempotencyKey: "video:gate:concurrent:0001", imageDataUrl: "data:image/png;base64,YWJj", imageSha256: sha("image") };
  const jobs = await Promise.all(Array.from({ length: 16 }, () => createService().submit(input)));
  assert.equal(new Set(jobs.map((job) => job.id)).size, 1);
  assert.equal(submits, 1, "multiworker duplicate requests submit once");
  await closePostgresPool(); // process restart boundary
  const finalized = await Promise.all(Array.from({ length: 12 }, () => createService().recover(jobs[0].id)));
  assert.equal(finalized.every((job) => job.status === "manual_review_required"), true);
  const approved = await createService().review({
    jobId: jobs[0].id,
    reviewerAccount: "video-reviewer@yijian.test",
    action: "approve",
    reason: "isolated PostgreSQL review evidence accepted",
    now: new Date("2026-07-28T08:00:00.000Z"),
  });
  assert.equal(approved.status, "succeeded");
  const verify = connections.open(targetUrl);
  await verify.connect();
  const approvedLink = (await verify.query<{ reservation_id: string }>(
    "SELECT reservation_id FROM video_generation_jobs WHERE id = $1", [jobs[0].id],
  )).rows[0];
  assert.ok(approvedLink?.reservation_id);
  assert.deepEqual((await verify.query(
    "SELECT status, outcome FROM commerce_generation_reservations WHERE id = $1", [approvedLink.reservation_id],
  )).rows[0], { status: "consumed", outcome: "succeeded" });
  assert.deepEqual((await verify.query(
    "SELECT review_key FROM video_generation_quality_reviews WHERE job_id = $1 AND reviewer_kind = 'manual'", [jobs[0].id],
  )).rows, [{ review_key: `manual.${jobs[0].id}` }], "actual UUID review key is accepted exactly once");

  const constraintJob = (await verify.query<{ id: string }>(
    `INSERT INTO video_generation_jobs (user_id, memory_id, idempotency_key, input_sha256)
     VALUES ($1, $2, 'video:gate:account-boundary:0001', $3) RETURNING id`,
    [ownerId, memory, sha("account-boundary")],
  )).rows[0].id;
  const insertAccountReview = (reviewKey: string, reviewerAccount: string) =>
    verify.query(
      `INSERT INTO video_generation_quality_reviews
         (job_id, review_key, reviewer_kind, reviewer_account, reviewed_at, decision, reason_codes, quality_payload)
       VALUES ($1, $2, 'manual', $3, '2026-07-28T08:00:00.000Z', 'approved', '[]'::jsonb, '{}'::jsonb)`,
      [constraintJob, reviewKey, reviewerAccount],
    );
  await insertAccountReview("manual-account-003", "abc");
  await insertAccountReview("manual-account-256", "a".repeat(256));
  await assert.rejects(insertAccountReview("manual-account-257", "a".repeat(257)));
  await assert.rejects(insertAccountReview("manual-account-space", "a b"));
  assert.equal(Number((await verify.query(
    "SELECT COUNT(*)::text AS count FROM video_generation_quality_reviews WHERE job_id = $1", [constraintJob],
  )).rows[0].count), 2, "only the exact 3- and 256-character manual accounts persist");

  const injection = await createService().submit({ ...input, idempotencyKey: "video:gate:review-injection:0001" });
  assert.equal((await createService().recover(injection.id)).status, "manual_review_required");
  const injectionLink = (await verify.query<{ reservation_id: string }>(
    "SELECT reservation_id FROM video_generation_jobs WHERE id = $1", [injection.id],
  )).rows[0];
  assert.ok(injectionLink?.reservation_id);
  await assert.rejects(
    new FirstPresenceVideoPostgresRepository().settleManualReview({
      id: injection.id,
      manualReview: {
        reviewerAccount: "x", // violates the real manual reviewer constraint
        reviewedAt: "2026-07-28T08:01:00.000Z",
        action: "approve",
        reason: "constraint injection",
      },
    }),
  );
  assert.deepEqual((await verify.query(
    "SELECT status, entitlement_settlement FROM video_generation_jobs WHERE id = $1", [injection.id],
  )).rows[0], { status: "manual_review_required", entitlement_settlement: "reserved" });
  assert.deepEqual((await verify.query(
    "SELECT status, outcome FROM commerce_generation_reservations WHERE id = $1", [injectionLink.reservation_id],
  )).rows[0], { status: "reserved", outcome: null });
  assert.equal(Number((await verify.query(
    "SELECT COUNT(*)::text AS count FROM video_generation_quality_reviews WHERE job_id = $1 AND reviewer_kind = 'manual'", [injection.id],
  )).rows[0].count), 0);
  const reviewInput = {
    jobId: injection.id,
    reviewerAccount: "video-reviewer@yijian.test",
    action: "approve" as const,
    reason: "isolated retry accepted",
    now: new Date("2026-07-28T08:02:00.000Z"),
  };
  const duplicateApprovals = await Promise.all(Array.from({ length: 8 }, () => createService().review(reviewInput)));
  assert.equal(duplicateApprovals.every((job) => job.status === "succeeded"), true);
  assert.equal(Number((await verify.query(
    "SELECT COUNT(*)::text AS count FROM video_generation_quality_reviews WHERE job_id = $1 AND reviewer_kind = 'manual'", [injection.id],
  )).rows[0].count), 1, "duplicate approve has one review row for this job");
  assert.deepEqual((await verify.query(
    `SELECT r.status, r.outcome, l.consumed_credits
     FROM commerce_generation_reservations r
     JOIN commerce_credit_lots l ON l.id = r.credit_lot_id
     WHERE r.id = $1`, [injectionLink.reservation_id],
  )).rows[0], { status: "consumed", outcome: "succeeded", consumed_credits: 2 }, "duplicate approve commits this linked reservation once");

  mode = "failed";
  const failed = await createService().submit({ ...input, idempotencyKey: "video:gate:release:0001" });
  assert.equal((await createService().recover(failed.id)).status, "failed");
  assert.deepEqual((await verify.query(`SELECT status, outcome FROM commerce_generation_reservations WHERE request_key = 'video:gate:release:0001'`)).rows[0], { status: "released", outcome: "system_failed" });

  mode = "lost";
  const uncertain = await createService().submit({ ...input, idempotencyKey: "video:gate:lost-response:0001" });
  const replays = await Promise.all(Array.from({ length: 16 }, () =>
    createService().submit({ ...input, idempotencyKey: "video:gate:lost-response:0001" }),
  ));
  const recoveredUncertain = await Promise.all(Array.from({ length: 16 }, () =>
    createService().recover(uncertain.id),
  ));
  await closePostgresPool(); // service restart must preserve the no-resubmit fence
  const restartedRecovery = await Promise.all(Array.from({ length: 16 }, () =>
    createService().recover(uncertain.id),
  ));
  assert.equal(uncertain.status, "submission_uncertain");
  assert.equal(replays.every((job) => job.id === uncertain.id && job.status === "submission_uncertain"), true);
  assert.equal(recoveredUncertain.every((job) => job.status === "submission_uncertain"), true);
  assert.equal(restartedRecovery.every((job) => job.status === "submission_uncertain"), true);
  assert.equal(submits, 3, "lost response is never blindly resubmitted");
  const uncertainLink = (await verify.query<{ reservation_id: string; provider_task_id: string | null; provider_submission_state: string }>(
    "SELECT reservation_id, provider_task_id, provider_submission_state FROM video_generation_jobs WHERE id = $1", [uncertain.id],
  )).rows[0];
  assert.ok(uncertainLink?.reservation_id);
  assert.equal(uncertainLink.provider_task_id, null);
  assert.equal(uncertainLink.provider_submission_state, "uncertain");
  assert.deepEqual((await verify.query(
    "SELECT status, outcome FROM commerce_generation_reservations WHERE id = $1", [uncertainLink.reservation_id],
  )).rows[0], { status: "reserved", outcome: null });
  await assert.rejects(createService().submit({ ...input, externalUserId: other, memoryId: otherMemory!, idempotencyKey: "video:gate:cross-user:0001" }));
  await connections.close(verify);
  await closePostgresPool();
  const auditUrl = new URL(adminUrl);
  auditUrl.searchParams.set("application_name", "memoryai-video-pg14-audit");
  const audit = new Client({ connectionString: auditUrl.toString() });
  try {
    await audit.connect();
    const lingering = await audit.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM pg_stat_activity
       WHERE datname = $1 AND application_name = $2`,
      [gateDatabase, gateApplicationName],
    );
    assert.equal(Number(lingering.rows[0]?.count ?? 0), 0, "gate leaves no target-database test clients");
  } finally {
    await audit.end();
  }
  } finally {
    await connections.closeAll();
    await closePostgresPool();
  }
});
