import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { NextRequest } from "next/server";
import pg from "pg";

import { createFirstPresencePlaybackAuthorizationHandler } from "../../app/api/memories/[id]/first-presence-video/[jobId]/playback/_handler";
import { createFirstPresencePlaybackReadHandler } from "../../app/api/first-presence-video/playback/[token]/_handler";
import { createVideoReviewsHandler } from "../../app/api/internal/video-reviews/_handler";
import { closePostgresPool } from "../../src/server/database";
import type { AuthSession } from "../../src/server/auth";
import { getCommerceProduct } from "../commerce/catalog";
import { CommercePostgresDataSource } from "../commerce/commerce-postgres-datasource";
import {
  FirstPresenceCommerceEntitlementPort,
  FirstPresenceVideoPostgresRepository,
} from "./first-presence-video-postgres";
import { FirstPresenceVideoService } from "./first-presence-video-service";
import {
  FirstPresenceVideoOwnerApiError,
  FirstPresenceVideoOwnerApiService,
  FirstPresenceVideoOwnerPostgresPort,
  NoopFirstPresenceVideoQueuePort,
} from "./first-presence-video-owner-api";
import {
  FirstPresencePlaybackAuthorizationService,
  FirstPresencePlaybackSigner,
  FirstPresenceVideoArtifactStorageReader,
} from "./first-presence-video-playback";
import { ViduFirstPresenceNetworkError } from "./vidu-first-presence-provider";
import { LocalStagingVideoArtifactStorage } from "./video-artifact-storage";
import { FirstPresenceVideoArtifactQueryPort } from "./video-artifact-query";
import { FirstPresenceVideoWorker } from "./first-presence-video-worker";

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
  let adminUrl: URL | null = null;
  let artifactRoot: string | null = null;
  const connections = new GateConnections();
  try {
  adminUrl = new URL(adminUrlValue);
  assertGate(adminUrl);
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
  const ownerPortraitSha = sha("video-gate-owner-portrait");
  await target.query(
    `INSERT INTO public.media_assets (
       user_id, memory_id, media_type, storage_key, mime_type, size_bytes,
       sha256, status, metadata
     ) VALUES ($1, $2, 'image', $3, 'image/png', 3, $4, 'uploaded', $5::jsonb)`,
    [
      ownerId,
      memory,
      "media/video-gate/owner-portrait.png",
      ownerPortraitSha,
      JSON.stringify({ qualityPreflightStatus: "passed" }),
    ],
  );
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
  const artifactStorage = new LocalStagingVideoArtifactStorage({
    root: artifactRoot = await mkdtemp(path.join(os.tmpdir(), "memoryai-video-pg14-artifacts-")),
    signingSecret: "v".repeat(48),
    playbackBaseUrl: "https://staging.yijian.test/internal/video-playback",
    downloader: {
      download: async ({ jobId }) => ({
        artifactKey: `provider/${jobId}.mp4`, body: Buffer.from("video"), contentType: "video/mp4", finalUrl: "https://provider.example/video.mp4",
      }),
    },
  });
  const createService = () => new FirstPresenceVideoService(
    new FirstPresenceVideoPostgresRepository(), provider, new FirstPresenceCommerceEntitlementPort(commerce),
    artifactStorage,
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
  const verify = connections.open(targetUrl);
  await verify.connect();
  const failedOwnerPort = new FirstPresenceVideoOwnerPostgresPort(() => ({
    stage: async () => { throw new Error("INPUT_STAGING_INJECTED_FAILURE"); },
    prepareCompanionMotionInput: async () => { throw new Error("unused"); },
    discard: async () => undefined,
  }));
  const failedOwnerApi = new FirstPresenceVideoOwnerApiService(
    failedOwnerPort,
    failedOwnerPort,
    new NoopFirstPresenceVideoQueuePort(),
  );
  await assert.rejects(
    failedOwnerApi.create({
      externalUserId: owner,
      memoryId: memory!,
      idempotencyKey: "video:gate:owner-staging-failure:0001",
      intent: "initial_preview",
    }),
    (error: unknown) => error instanceof FirstPresenceVideoOwnerApiError
      && error.code === "VIDEO_INPUT_STAGING_UNAVAILABLE",
  );
  assert.equal(Number((await verify.query(
    "SELECT COUNT(*)::text AS count FROM video_generation_jobs WHERE idempotency_key = 'video:gate:owner-staging-failure:0001'",
  )).rows[0].count), 0, "input staging failure rolls back the durable job");
  assert.equal(Number((await verify.query(
    "SELECT COUNT(*)::text AS count FROM commerce_generation_reservations WHERE request_key = 'video:gate:owner-staging-failure:0001'",
  )).rows[0].count), 0, "input staging failure rolls back its reservation");

  const ownerPort = new FirstPresenceVideoOwnerPostgresPort(() => ({
    stage: ({ jobId }) => artifactStorage.stageInput({
      jobId,
      imageDataUrl: "data:image/png;base64,YWJj",
    }),
    prepareCompanionMotionInput: async () => ({
      imageDataUrl: "data:image/png;base64,YWJj",
      inputSha256: sha("owner-video-derived-frame"),
    }),
    discard: ({ jobId }) => artifactStorage.deleteInput({ jobId }),
  }));
  const ownerApi = new FirstPresenceVideoOwnerApiService(
    ownerPort,
    ownerPort,
    new NoopFirstPresenceVideoQueuePort(),
  );
  await assert.rejects(
    ownerApi.create({
      externalUserId: owner,
      memoryId: memory!,
      idempotencyKey: "video:gate:two-rounds-required:0001",
      intent: "additional_generation",
    }),
    (error: unknown) => error instanceof FirstPresenceVideoOwnerApiError
      && error.code === "TWO_CHAT_ROUNDS_REQUIRED",
  );
  const legacyConversation = (await verify.query<{ id: string }>(
    `INSERT INTO public.conversations (user_id, memory_id, title, is_default)
     VALUES ($1, $2, 'Legacy non-default conversation', FALSE) RETURNING id`,
    [ownerId, memory],
  )).rows[0].id;
  for (const round of [1, 2]) {
    const userMessage = (await verify.query<{ id: string }>(
      `INSERT INTO public.messages (conversation_id, user_id, memory_id, role, content)
       VALUES ($1, $2, $3, 'user', $4) RETURNING id`,
      [legacyConversation, ownerId, memory, `Legacy user message ${round}`],
    )).rows[0].id;
    const assistantMessage = (await verify.query<{ id: string }>(
      `INSERT INTO public.messages (conversation_id, user_id, memory_id, role, content)
       VALUES ($1, $2, $3, 'assistant', $4) RETURNING id`,
      [legacyConversation, ownerId, memory, `Legacy assistant message ${round}`],
    )).rows[0].id;
    await verify.query(
      `INSERT INTO public.memory_chat_turns (
         user_id, memory_id, conversation_id, idempotency_key, request_hash, status,
         user_message_id, assistant_message_id
       ) VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7)`,
      [ownerId, memory, legacyConversation, `video:gate:legacy-round-${round}:0001`, sha(`legacy round ${round}`), userMessage, assistantMessage],
    );
  }
  await assert.rejects(
    ownerApi.create({
      externalUserId: owner,
      memoryId: memory!,
      idempotencyKey: "video:gate:legacy-rounds-ignored:0001",
      intent: "additional_generation",
    }),
    (error: unknown) => error instanceof FirstPresenceVideoOwnerApiError
      && error.code === "TWO_CHAT_ROUNDS_REQUIRED",
    "completed turns from a non-default conversation cannot unlock another video",
  );
  const ownerPreview = await ownerApi.create({
    externalUserId: owner,
    memoryId: memory!,
    idempotencyKey: "video:gate:owner-initial-preview:0001",
    intent: "initial_preview",
  });
  assert.equal(ownerPreview.status, "queued");
  const ownerPreviewReplay = await ownerApi.create({
    externalUserId: owner,
    memoryId: memory!,
    idempotencyKey: "video:gate:owner-initial-preview:0001",
    intent: "initial_preview",
  });
  assert.equal(ownerPreviewReplay.id, ownerPreview.id, "owner idempotency does not create a second job or reservation");
  const ownerWorker = new FirstPresenceVideoWorker(new FirstPresenceVideoPostgresRepository(), createService());
  await ownerWorker.runOnce();
  await ownerWorker.runOnce();
  delete process.env.YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED;
  delete process.env.VIDEO_REVIEW_ACCESS_TOKEN;
  delete process.env.YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED;
  delete process.env.VIDEO_RECONCILIATION_ACCESS_TOKEN;
  delete process.env.YIJIAN_VIDEO_RECONCILIATION_ACCOUNT;
  delete process.env.YIJIAN_VIDEO_REVIEW_ACCOUNT;
  const reviewHandler = createVideoReviewsHandler(() => createService());
  const reviewRequest = (headers: Record<string, string>) => new NextRequest(
    "https://memoryai.test/api/internal/video-reviews",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ jobId: ownerPreview.id, action: "approve", reason: "isolated owner initial preview review" }),
    },
  );
  assert.equal((await reviewHandler(reviewRequest({}))).status, 401, "manual review remains disabled without its exact internal flag");
  const reviewToken = "review-A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0Uv";
  Object.assign(process.env, {
    YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED: "true",
    VIDEO_REVIEW_ACCESS_TOKEN: reviewToken,
    YIJIAN_VIDEO_REVIEW_ACCOUNT: "video-reviewer@yijian.test",
    YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED: "true",
    VIDEO_RECONCILIATION_ACCESS_TOKEN: "reconcile-Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0Ff",
    YIJIAN_VIDEO_RECONCILIATION_ACCOUNT: "video-reconciler@yijian.test",
  });
  assert.equal((await reviewHandler(reviewRequest({
    "x-video-review-access-token": reviewToken,
    "x-video-reviewer-account": "attacker@yijian.test",
  }))).status, 401, "manual review rejects a non-exact reviewer account");
  const ownerPreviewReview = await reviewHandler(reviewRequest({
    "x-video-review-access-token": reviewToken,
    "x-video-reviewer-account": "video-reviewer@yijian.test",
  }));
  assert.equal(ownerPreviewReview.status, 202);
  const ownerPreviewApproved = await ownerPort.listForOwner({ externalUserId: owner, memoryId: memory! });
  assert.equal(ownerPreviewApproved[0]?.status, "succeeded");
  delete process.env.YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED;
  delete process.env.VIDEO_REVIEW_ACCESS_TOKEN;
  delete process.env.YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED;
  delete process.env.VIDEO_RECONCILIATION_ACCESS_TOKEN;
  delete process.env.YIJIAN_VIDEO_RECONCILIATION_ACCOUNT;
  delete process.env.YIJIAN_VIDEO_REVIEW_ACCOUNT;
  const ownerArtifacts = new FirstPresenceVideoArtifactQueryPort(artifactStorage);
  const ownerPreviewArtifact = await ownerArtifacts.findApprovedForOwner({
    externalUserId: owner,
    memoryId: memory!,
    jobId: ownerPreview.id,
  });
  assert.ok(ownerPreviewArtifact);
  assert.equal(ownerPreviewArtifact.presentation, "initial_preview");
  assert.equal(ownerPreviewArtifact.saveAllowed, false, "initial previews are inline-only and never acquire save rights");

  const playbackSigner = new FirstPresencePlaybackSigner("p".repeat(48));
  const ownerSession = async () => ({ externalUserId: owner } as AuthSession);
  const authorizationHandler = createFirstPresencePlaybackAuthorizationHandler(
    () => new FirstPresencePlaybackAuthorizationService(ownerArtifacts, playbackSigner),
    ownerSession,
  );
  const authorizationResponse = await authorizationHandler.GET(new NextRequest(
    `https://memoryai.test/api/memories/${memory}/first-presence-video/${ownerPreview.id}/playback`,
  ), { params: Promise.resolve({ id: memory!, jobId: ownerPreview.id }) });
  assert.equal(authorizationResponse.status, 200);
  const authorizationBody = await authorizationResponse.json() as { playback: { url: string; saveAllowed: boolean; contentDisposition: string } };
  assert.equal(authorizationBody.playback.saveAllowed, false);
  assert.equal(authorizationBody.playback.contentDisposition, "inline");
  assert.doesNotMatch(JSON.stringify(authorizationBody), /video-artifacts|provider|storage_key|\\.mp4/i);
  const playbackToken = decodeURIComponent(new URL(authorizationBody.playback.url, "https://memoryai.test").pathname.split("/").at(-1)!);
  const playbackHandler = createFirstPresencePlaybackReadHandler(
    () => ({
      artifacts: ownerArtifacts,
      reader: new FirstPresenceVideoArtifactStorageReader(artifactStorage),
      signer: playbackSigner,
    }),
    ownerSession,
  );
  const playbackResponse = await playbackHandler.GET(new NextRequest(
    `https://memoryai.test/api/first-presence-video/playback/${playbackToken}`,
  ), { params: Promise.resolve({ token: playbackToken }) });
  assert.equal(playbackResponse.status, 200);
  assert.equal(await playbackResponse.text(), "video");
  assert.equal(playbackResponse.headers.get("content-type"), "video/mp4");
  assert.equal(playbackResponse.headers.get("content-length"), "5");
  assert.equal(playbackResponse.headers.get("accept-ranges"), "bytes");
  assert.match(playbackResponse.headers.get("content-disposition") ?? "", /^inline/);
  const rangeResponse = await playbackHandler.GET(new NextRequest(
    `https://memoryai.test/api/first-presence-video/playback/${playbackToken}`,
    { headers: { range: "bytes=1-3" } },
  ), { params: Promise.resolve({ token: playbackToken }) });
  assert.equal(rangeResponse.status, 206);
  assert.equal(await rangeResponse.text(), "ide");
  assert.equal(rangeResponse.headers.get("content-range"), "bytes 1-3/5");
  const multiRangeResponse = await playbackHandler.GET(new NextRequest(
    `https://memoryai.test/api/first-presence-video/playback/${playbackToken}`,
    { headers: { range: "bytes=0-1,3-4" } },
  ), { params: Promise.resolve({ token: playbackToken }) });
  assert.equal(multiRangeResponse.status, 416);
  const otherSession = async () => ({ externalUserId: other } as AuthSession);
  const crossUserRead = createFirstPresencePlaybackReadHandler(
    () => ({ artifacts: ownerArtifacts, reader: new FirstPresenceVideoArtifactStorageReader(artifactStorage), signer: playbackSigner }),
    otherSession,
  );
  const crossUserResponse = await crossUserRead.GET(new NextRequest(
    `https://memoryai.test/api/first-presence-video/playback/${playbackToken}`,
  ), { params: Promise.resolve({ token: playbackToken }) });
  assert.equal(crossUserResponse.status, 404);
  const expiredToken = playbackSigner.issue({ artifact: ownerPreviewArtifact, externalUserId: owner, now: new Date(0), ttlSeconds: 1 }).token;
  const expiredResponse = await playbackHandler.GET(new NextRequest(
    `https://memoryai.test/api/first-presence-video/playback/${expiredToken}`,
  ), { params: Promise.resolve({ token: expiredToken }) });
  assert.equal(expiredResponse.status, 404);
  const tamperedToken = `${playbackToken.slice(0, -1)}${playbackToken.endsWith("a") ? "b" : "a"}`;
  const tamperedResponse = await playbackHandler.GET(new NextRequest(
    `https://memoryai.test/api/first-presence-video/playback/${tamperedToken}`,
  ), { params: Promise.resolve({ token: tamperedToken }) });
  assert.equal(tamperedResponse.status, 404);
  const reboundJobId = "00000000-0000-4000-8000-000000000099";
  const reboundArtifact = await artifactStorage.stageArtifact({ jobId: reboundJobId, body: Buffer.from("other"), contentType: "video/mp4" });
  await verify.query("UPDATE public.video_generation_jobs SET artifact_key = $2 WHERE id = $1", [ownerPreview.id, reboundArtifact.artifactKey]);
  const reboundResponse = await playbackHandler.GET(new NextRequest(
    `https://memoryai.test/api/first-presence-video/playback/${playbackToken}`,
  ), { params: Promise.resolve({ token: playbackToken }) });
  assert.equal(reboundResponse.status, 404, "a token cannot survive an artifact binding change");
  await verify.query("UPDATE public.video_generation_jobs SET artifact_key = $2 WHERE id = $1", [ownerPreview.id, ownerPreviewArtifact.artifactKey]);
  const submitsBeforeServiceFlows = submits;
  const input = { externalUserId: owner, memoryId: memory!, idempotencyKey: "video:gate:concurrent:0001", imageDataUrl: "data:image/png;base64,YWJj", imageSha256: sha("image") };
  const jobs = await Promise.all(Array.from({ length: 16 }, () => createService().submit(input)));
  assert.equal(new Set(jobs.map((job) => job.id)).size, 1);
  assert.equal(submits, submitsBeforeServiceFlows + 1, "multiworker duplicate requests submit once");
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
  const approvedLink = (await verify.query<{ reservation_id: string }>(
    "SELECT reservation_id FROM video_generation_jobs WHERE id = $1", [jobs[0].id],
  )).rows[0];
  assert.ok(approvedLink?.reservation_id);
  assert.deepEqual((await verify.query(
    "SELECT status, outcome FROM commerce_generation_reservations WHERE id = $1", [approvedLink.reservation_id],
  )).rows[0], { status: "consumed", outcome: "succeeded" });
  const artifacts = new FirstPresenceVideoArtifactQueryPort(artifactStorage);
  const approvedArtifact = await artifacts.findApprovedForOwner({ externalUserId: owner, memoryId: memory!, jobId: approved.id, expiresInSeconds: 60 });
  assert.ok(approvedArtifact);
  assert.equal(approvedArtifact.presentation, "additional_generation");
  assert.equal(approvedArtifact.saveAllowed, true);
  assert.match(approvedArtifact.playbackUrl, /signature=/);
  assert.equal(await artifacts.findApprovedForOwner({ externalUserId: other, memoryId: otherMemory!, jobId: approved.id }), null, "cross-user artifact reads are hidden");
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
  assert.equal(await artifacts.findApprovedForOwner({ externalUserId: owner, memoryId: memory!, jobId: injection.id }), null, "manual-review artifacts are never user-readable");
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
  assert.equal(submits, submitsBeforeServiceFlows + 4, "the fourth submit is the initial lost response; replays never submit again");
  const uncertainLink = (await verify.query<{ reservation_id: string; provider_task_id: string | null; provider_submission_state: string }>(
    "SELECT reservation_id, provider_task_id, provider_submission_state FROM video_generation_jobs WHERE id = $1", [uncertain.id],
  )).rows[0];
  assert.ok(uncertainLink?.reservation_id);
  assert.equal(uncertainLink.provider_task_id, null);
  assert.equal(uncertainLink.provider_submission_state, "uncertain");
  assert.deepEqual((await verify.query(
    "SELECT status, outcome FROM commerce_generation_reservations WHERE id = $1", [uncertainLink.reservation_id],
  )).rows[0], { status: "reserved", outcome: null });

  const repository = new FirstPresenceVideoPostgresRepository();
  const attachRequest = {
    id: uncertain.id,
    requestKey: "video:gate:attach-uncertain:0001",
    operatorAccount: "video-reconciler@yijian.test",
    action: "ATTACH_PROVIDER_TASK" as const,
    providerTaskId: "vidu-confirmed-task-001",
    reason: "Vidu backoffice confirms the task exists",
  };
  const attached = await Promise.all(Array.from({ length: 8 }, () =>
    repository.reconcileUncertainSubmission(attachRequest),
  ));
  assert.equal(attached.every((job) => job.status === "submitted" && job.providerTaskId === attachRequest.providerTaskId), true);
  assert.equal(submits, submitsBeforeServiceFlows + 4, "attach never submits or consumes a credit");
  assert.equal((await createService().recover(uncertain.id)).status, "manual_review_required", "attached task returns to normal polling and review");
  assert.equal(Number((await verify.query(
    "SELECT COUNT(*)::text AS count FROM video_generation_reconciliations WHERE job_id = $1", [uncertain.id],
  )).rows[0].count), 1, "attach writes one auditable idempotent action");

  mode = "lost";
  const unresolved = await createService().submit({ ...input, idempotencyKey: "video:gate:release-unresolved:0001" });
  assert.equal(unresolved.status, "submission_uncertain");
  assert.equal(submits, submitsBeforeServiceFlows + 5);
  const unresolvedLink = (await verify.query<{ reservation_id: string }>(
    "SELECT reservation_id FROM video_generation_jobs WHERE id = $1", [unresolved.id],
  )).rows[0];
  assert.ok(unresolvedLink?.reservation_id);
  const releaseRequest = {
    id: unresolved.id,
    requestKey: "video:gate:release-uncertain:0001",
    operatorAccount: "video-reconciler@yijian.test",
    action: "RELEASE_UNRESOLVED" as const,
    reason: "Vidu backoffice cannot locate the task",
  };
  const released = await Promise.all(Array.from({ length: 8 }, () =>
    repository.reconcileUncertainSubmission(releaseRequest),
  ));
  assert.equal(released.every((job) => job.status === "failed"), true);
  assert.deepEqual((await verify.query(
    "SELECT status, outcome FROM commerce_generation_reservations WHERE id = $1", [unresolvedLink.reservation_id],
  )).rows[0], { status: "released", outcome: "system_failed" });
  assert.equal(Number((await verify.query(
    "SELECT COUNT(*)::text AS count FROM video_generation_reconciliations WHERE job_id = $1", [unresolved.id],
  )).rows[0].count), 1, "release writes one action and settles once");

  const contested = await createService().submit({ ...input, idempotencyKey: "video:gate:contested-uncertain:0001" });
  assert.equal(contested.status, "submission_uncertain");
  const race = await Promise.allSettled([
    repository.reconcileUncertainSubmission({
      id: contested.id, requestKey: "video:gate:race-attach:0001", operatorAccount: "video-reconciler@yijian.test",
      action: "ATTACH_PROVIDER_TASK", providerTaskId: "vidu-confirmed-task-race", reason: "attach race",
    }),
    repository.reconcileUncertainSubmission({
      id: contested.id, requestKey: "video:gate:race-release:0001", operatorAccount: "video-reconciler@yijian.test",
      action: "RELEASE_UNRESOLVED", reason: "release race",
    }),
  ]);
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1, "attach and release cannot both reconcile one job");
  assert.equal(Number((await verify.query(
    "SELECT COUNT(*)::text AS count FROM video_generation_reconciliations WHERE job_id = $1", [contested.id],
  )).rows[0].count), 1);
  mode = "success";
  const workerBaseline = submits;
  const queuedForWorker = await createService().enqueue({ ...input, idempotencyKey: "video:gate:worker-restart:0001" });
  const workerA = new FirstPresenceVideoWorker(new FirstPresenceVideoPostgresRepository(), createService());
  const workerB = new FirstPresenceVideoWorker(new FirstPresenceVideoPostgresRepository(), createService());
  await Promise.all([workerA.runOnce(), workerB.runOnce()]);
  assert.equal(submits, workerBaseline + 1, "two PostgreSQL workers claim one queued job before Vidu submit");
  await closePostgresPool();
  await new FirstPresenceVideoWorker(new FirstPresenceVideoPostgresRepository(), createService()).runOnce();
  assert.equal((await new FirstPresenceVideoPostgresRepository().findById(queuedForWorker.id))?.status, "manual_review_required", "a restarted worker resumes poll/download/quality without another submit");
  assert.equal(submits, workerBaseline + 1);
  await assert.rejects(createService().submit({ ...input, externalUserId: other, memoryId: otherMemory!, idempotencyKey: "video:gate:cross-user:0001" }));
  const defaultConversation = (await verify.query<{ id: string }>(
    `INSERT INTO public.conversations (user_id, memory_id, title, is_default)
     VALUES ($1, $2, 'Default formal conversation', TRUE) RETURNING id`,
    [ownerId, memory],
  )).rows[0].id;
  for (const round of [1, 2]) {
    const userMessage = (await verify.query<{ id: string }>(
      `INSERT INTO public.messages (conversation_id, user_id, memory_id, role, content)
       VALUES ($1, $2, $3, 'user', $4) RETURNING id`,
      [defaultConversation, ownerId, memory, `Formal user message ${round}`],
    )).rows[0].id;
    const assistantMessage = (await verify.query<{ id: string }>(
      `INSERT INTO public.messages (conversation_id, user_id, memory_id, role, content)
       VALUES ($1, $2, $3, 'assistant', $4) RETURNING id`,
      [defaultConversation, ownerId, memory, `Formal assistant message ${round}`],
    )).rows[0].id;
    await verify.query(
      `INSERT INTO public.memory_chat_turns (
         user_id, memory_id, conversation_id, idempotency_key, request_hash, status,
         user_message_id, assistant_message_id
       ) VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7)`,
      [ownerId, memory, defaultConversation, `video:gate:formal-round-${round}:0001`, sha(`formal round ${round}`), userMessage, assistantMessage],
    );
  }
  const additionalAfterFormalRounds = await ownerApi.create({
    externalUserId: owner,
    memoryId: memory!,
    idempotencyKey: "video:gate:formal-rounds-accepted:0001",
    intent: "additional_generation",
  });
  assert.equal(additionalAfterFormalRounds.status, "queued", "two completed default-session rounds unlock the additional video request");
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
    if (adminUrl) {
      const cleanup = new Client({ connectionString: adminUrl.toString() });
      try {
        await cleanup.connect();
        await cleanup.query(`DROP DATABASE IF EXISTS "${gateDatabase}"`);
        await cleanup.query(`DROP DATABASE IF EXISTS "${rollbackDatabase}"`);
        const leftovers = await cleanup.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM pg_database WHERE datname = ANY($1::text[])",
          [[gateDatabase, rollbackDatabase]],
        );
        assert.equal(Number(leftovers.rows[0]?.count ?? 0), 0, "gate removes every temporary database");
      } finally {
        await cleanup.end();
      }
    }
    if (artifactRoot) await rm(artifactRoot, { recursive: true, force: true });
  }
});
