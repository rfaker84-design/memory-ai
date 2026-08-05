import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { NextRequest } from "next/server";
import pg from "pg";

import { createAccountDeletionHandler } from "../../app/api/account/deletion/_handler";
import { createAccountDataExportHandler } from "../../app/api/account/export/_handler";
import { createCommerceOrdersHandler } from "../../app/api/commerce/orders/_handler";
import { createCommerceRefundsHandler } from "../../app/api/commerce/refunds/_handler";
import { createConsentsHandler } from "../../app/api/consents/_handler";
import { createMemoryItemHandlers, MEMORY_DELETION_CONFIRMATION } from "../../app/api/memories/[id]/_handlers";
import { createOwnerVideoShareHandler } from "../../app/api/memories/[id]/video-shares/_handler";
import { ACCOUNT_DELETION_CONFIRMATION } from "../account-deletion/account-deletion-service";
import {
  HIGH_RISK_OPERATIONS,
  UNDERSTANDING_ASSISTANCE_VERSION,
  hasExplicitAssistanceRequest,
  shouldOfferAssistanceAfterConfirmationFailures,
} from "./understanding-assistance";

const { Client } = pg;
const adminUrlValue = process.env.UNDERSTANDING_ASSISTANCE_POSTGRES_GATE_ADMIN_URL;
const databaseName = process.env.UNDERSTANDING_ASSISTANCE_POSTGRES_GATE_DATABASE ?? `understanding_assistance_gate_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const tsxCli = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const refreshChild = fileURLToPath(new URL("./understanding-assistance-postgres14.refresh-child.ts", import.meta.url));
const origin = "https://memoryai.test";
const memoryId = "00000000-0000-4000-8000-000000000002";

function databaseUrl(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  url.searchParams.set("application_name", "memoryai-understanding-assistance-pg14-gate");
  return url.toString();
}

async function migration(index: number): Promise<string> {
  const prefix = `${String(index).padStart(3, "0")}_`;
  const names = await readdir(new URL("../../database/migrations/", import.meta.url));
  const name = names.find((candidate) => candidate.startsWith(prefix));
  if (!name) throw new Error(`MIGRATION_NOT_FOUND_${prefix}`);
  return readFile(new URL(`../../database/migrations/${name}`, import.meta.url), "utf8");
}

function assertDatabaseName(database: string): void {
  assert.match(database, /^understanding_assistance_gate_[a-z0-9_]+$/);
}

async function createDatabase(admin: InstanceType<typeof Client>, database: string): Promise<void> {
  assertDatabaseName(database);
  await admin.query(`CREATE DATABASE "${database}"`);
}

async function dropDatabase(admin: InstanceType<typeof Client>, database: string): Promise<void> {
  assertDatabaseName(database);
  await assertNoConnections(admin, database);
  await admin.query(`DROP DATABASE "${database}"`);
}

async function assertNoConnections(admin: InstanceType<typeof Client>, database: string): Promise<void> {
  const all = await admin.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()",
    [database],
  );
  const tagged = await admin.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND application_name='memoryai-understanding-assistance-pg14-gate' AND pid <> pg_backend_pid()",
    [database],
  );
  assert.equal(all.rows[0]?.count, 0);
  assert.equal(tagged.rows[0]?.count, 0);
}

async function freshProcessState(input: { userId: string; externalUserId: string }): Promise<unknown> {
  await access(tsxCli);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, refreshChild], {
      cwd: projectRoot,
      env: {
        ...process.env,
        UNDERSTANDING_ASSISTANCE_GATE_USER_ID: input.userId,
        UNDERSTANDING_ASSISTANCE_GATE_EXTERNAL_USER_ID: input.externalUserId,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) return reject(new Error(`UNDERSTANDING_ASSISTANCE_REFRESH_PROCESS_FAILED=${code}:${stderr}`));
      try { resolve(JSON.parse(stdout)); }
      catch (error) { reject(error); }
    });
  });
}

test("understanding assistance PostgreSQL 14.23 persists only minimal owner-bound consent through migration 017 replay and rollback", {
  skip: adminUrlValue ? false : "set UNDERSTANDING_ASSISTANCE_POSTGRES_GATE_ADMIN_URL to run isolated destructive PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  assert.match(new URL(adminUrlValue).hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.equal(process.env.UNDERSTANDING_ASSISTANCE_POSTGRES_GATE_ALLOW_DROP, "YES");
  assertDatabaseName(databaseName);

  const targetUrl = databaseUrl(adminUrlValue, databaseName);
  const rollbackName = `${databaseName}_rollback`;
  const rollbackUrl = databaseUrl(adminUrlValue, rollbackName);
  const admin = new Client({ connectionString: adminUrlValue });
  const originalEnvironment = new Map(["DATABASE_URL", "DATABASE_SSL", "DATABASE_POOL_MAX", "NODE_ENV", "AUTH_ALLOWED_ORIGIN", "ACCOUNT_DELETION_ENABLED", "ACCOUNT_DATA_EXPORT_ENABLED", "AUTH_SESSION_REVOCATION_ENFORCED"].map((name) => [name, process.env[name]]));
  let target: InstanceType<typeof Client> | undefined;
  let rollback: InstanceType<typeof Client> | undefined;
  let closePostgresPool: (() => Promise<void>) | undefined;
  const databases = [databaseName, rollbackName];

  try {
    await admin.connect();
    assert.match((await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "", /^14\.23(?:\D|$)/);
    await createDatabase(admin, databaseName);
    target = new Client({ connectionString: targetUrl });
    await target.connect();
    for (let index = 1; index <= 16; index += 1) await target.query(await migration(index));

    process.env.DATABASE_URL = targetUrl;
    process.env.DATABASE_SSL = "false";
    process.env.DATABASE_POOL_MAX = "4";
    process.env.AUTH_ALLOWED_ORIGIN = origin;
    process.env.ACCOUNT_DELETION_ENABLED = "true";
    process.env.ACCOUNT_DATA_EXPORT_ENABLED = "true";
    process.env.AUTH_SESSION_REVOCATION_ENFORCED = "true";

    const [serviceModule, databaseModule, refundModule] = await Promise.all([
      import("./understanding-assistance-postgres"),
      import("@/src/server/database"),
      import("../../app/api/commerce/refunds/_handler"),
    ]);
    const { PostgresUnderstandingAssistanceService, UnderstandingAssistanceError } = serviceModule;
    closePostgresPool = databaseModule.closePostgresPool;
    const { createCommerceRefundsHandler } = refundModule;

    const ownerA = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pg14-assistance-owner-a') RETURNING id")).rows[0]!;
    const ownerB = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pg14-assistance-owner-b') RETURNING id")).rows[0]!;
    const service = new PostgresUnderstandingAssistanceService();
    const enabled = await service.enable({ userId: ownerA.id, externalUserId: "pg14-assistance-owner-a", requestKey: "understanding-assistance-pg14-enable-0001", now: new Date("2026-08-05T00:00:00.000Z") });
    assert.deepEqual(enabled, { enabled: true, confirmationVersion: UNDERSTANDING_ASSISTANCE_VERSION, updatedAt: "2026-08-05T00:00:00.000Z" });
    const persisted = await target.query<{ status: string; version: string; requestKey: string }>(
      "SELECT status, metadata ->> 'version' AS version, metadata ->> 'requestKey' AS \"requestKey\" FROM consent_records WHERE user_id=$1 AND consent_type='understanding_assistance' AND memory_id IS NULL",
      [ownerA.id],
    );
    assert.deepEqual(persisted.rows, [{ status: "approved", version: UNDERSTANDING_ASSISTANCE_VERSION, requestKey: "understanding-assistance-pg14-enable-0001" }]);

    // 017 is intentionally not an automatic runner. Its first execution and
    // idempotent replay must leave the pre-existing consent ledger untouched.
    await target.query(await migration(17));
    await target.query(await migration(17));
    assert.deepEqual(await service.read({ userId: ownerA.id, externalUserId: "pg14-assistance-owner-a" }), enabled);

    await closePostgresPool();
    closePostgresPool = databaseModule.closePostgresPool;
    assert.deepEqual(await freshProcessState({ userId: ownerA.id, externalUserId: "pg14-assistance-owner-a" }), enabled);

    assert.deepEqual(await service.read({ userId: ownerB.id, externalUserId: "pg14-assistance-owner-b" }), { enabled: false, confirmationVersion: null, updatedAt: null });
    assert.deepEqual(await service.read({ userId: ownerA.id, externalUserId: "pg14-assistance-owner-b" }), { enabled: false, confirmationVersion: null, updatedAt: null });
    await assert.rejects(service.enable({ userId: ownerA.id, externalUserId: "pg14-assistance-owner-b", requestKey: "understanding-assistance-pg14-forged-0001" }), (error: unknown) => error instanceof UnderstandingAssistanceError && error.code === "ACCOUNT_NOT_FOUND");
    await assert.rejects(service.revoke({ userId: ownerA.id, externalUserId: "pg14-assistance-owner-b" }), (error: unknown) => error instanceof UnderstandingAssistanceError && error.code === "ACCOUNT_NOT_FOUND");
    assert.deepEqual(await service.read({ userId: ownerA.id, externalUserId: "pg14-assistance-owner-a" }), enabled);

    let writes = 0;
    const session = async () => ({ userId: ownerA.id, externalUserId: "pg14-assistance-owner-a", authenticatedAt: new Date().toISOString(), expiresAt: "2026-12-31T00:00:00.000Z" });
    const headers = { origin, "content-type": "application/json" };
    const order = createCommerceOrdersHandler(() => ({ createOrder: async () => { writes += 1; throw new Error("UNREACHABLE"); }, listOrders: async () => [] }), session, () => ({ rail: "test", prepareCheckout: async () => ({ kind: "test_callback_required" as const, orderNo: "YC20260805000000AAAAAAAAAAA1", chargesMoney: false }) }), () => undefined, async () => true);
    const refund = createCommerceRefundsHandler(() => ({ requestRefund: async () => { writes += 1; throw new Error("UNREACHABLE"); }, listRefunds: async () => [] }), session);
    const exporter = createAccountDataExportHandler({ create: async () => { writes += 1; throw new Error("UNREACHABLE"); } }, session);
    const deletion = createAccountDeletionHandler({ request: async () => { writes += 1; throw new Error("UNREACHABLE"); }, getProgress: async () => null, getProgressByReceipt: async () => null }, session);
    const memory = createMemoryItemHandlers(() => ({ getMemoryForUser: async () => null, updateMemoryForUser: async () => { throw new Error("UNREACHABLE"); }, deleteMemoryForUser: async () => { writes += 1; } }), session);
    const shares = createOwnerVideoShareHandler({ listForOwner: async () => [], createForOwner: async () => { writes += 1; throw new Error("UNREACHABLE"); } }, session);
    const consent = createConsentsHandler(async () => { writes += 1; }, session);
    const context = { params: Promise.resolve({ id: memoryId }) };
    const responses = await Promise.all([
      order.POST(new NextRequest(`${origin}/api/commerce/orders`, { method: "POST", headers: { ...headers, "idempotency-key": "understanding-assistance-pg14-order-0001" }, body: JSON.stringify({ memoryId, productId: "memory_video_49", platform: "web" }) })),
      refund.POST(new NextRequest(`${origin}/api/commerce/refunds`, { method: "POST", headers: { ...headers, "idempotency-key": "understanding-assistance-pg14-refund-0001" }, body: JSON.stringify({ orderNo: "YC20260805000000AAAAAAAAAAA1", reason: "service_failure" }) })),
      exporter.POST(new NextRequest(`${origin}/api/account/export`, { method: "POST", headers })),
      deletion.POST(new NextRequest(`${origin}/api/account/deletion`, { method: "POST", headers, body: JSON.stringify({ confirmation: ACCOUNT_DELETION_CONFIRMATION }) })),
      memory.DELETE(new NextRequest(`${origin}/api/memories/${memoryId}`, { method: "DELETE", headers, body: JSON.stringify({ confirmation: MEMORY_DELETION_CONFIRMATION }) }), context),
      shares.POST(new NextRequest(`${origin}/api/memories/${memoryId}/video-shares`, { method: "POST", headers, body: JSON.stringify({ jobId: "00000000-0000-4000-8000-000000000003", title: "test" }) }), context),
      consent(new NextRequest(`${origin}/api/consents`, { method: "POST", headers: { ...headers, "idempotency-key": "understanding-assistance-pg14-consent-0001" }, body: JSON.stringify({ consentType: "commercial_use", memoryId }) })),
    ]);
    for (const response of responses) assert.equal(response.status, 409);
    assert.equal(writes, 0);

    // The guard has no ordinary-chat operation and explicit wording is the
    // only natural-language trigger; grief, age, typos, and emotion do not
    // create persisted protection state or block ordinary use.
    for (const ordinaryMessage of ["我今天很难过，想念家人", "我八十岁了", "我打字很慢", "我现在很激动"]) assert.equal(hasExplicitAssistanceRequest(ordinaryMessage), false);
    assert.equal(shouldOfferAssistanceAfterConfirmationFailures({ operation: "chat", failedConfirmations: 99 }), false);

    const revoked = await service.revoke({ userId: ownerA.id, externalUserId: "pg14-assistance-owner-a", now: new Date("2026-08-05T00:01:00.000Z") });
    assert.deepEqual(revoked, { enabled: false, confirmationVersion: null, updatedAt: null });
    await closePostgresPool();
    closePostgresPool = databaseModule.closePostgresPool;
    assert.deepEqual(await freshProcessState({ userId: ownerA.id, externalUserId: "pg14-assistance-owner-a" }), revoked);
    for (const operation of HIGH_RISK_OPERATIONS) await new PostgresUnderstandingAssistanceService().assertHighRiskAllowed({ userId: ownerA.id, externalUserId: "pg14-assistance-owner-a", operation });

    await closePostgresPool();
    closePostgresPool = databaseModule.closePostgresPool;
    await target.end();
    target = undefined;
    await assertNoConnections(admin, databaseName);

    await createDatabase(admin, rollbackName);
    rollback = new Client({ connectionString: rollbackUrl });
    await rollback.connect();
    for (let index = 1; index <= 16; index += 1) await rollback.query(await migration(index));
    process.env.DATABASE_URL = rollbackUrl;
    const rollbackOwner = (await rollback.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pg14-assistance-rollback-owner') RETURNING id")).rows[0]!;
    const rollbackService = new PostgresUnderstandingAssistanceService();
    const rollbackEnabled = await rollbackService.enable({ userId: rollbackOwner.id, externalUserId: "pg14-assistance-rollback-owner", requestKey: "understanding-assistance-pg14-rollback-0001" });
    await assert.rejects(rollback.query((await migration(17)).replace(/COMMIT;\s*$/, "SELECT 1/0;\nCOMMIT;")));
    await rollback.query("ROLLBACK");
    assert.equal((await rollback.query("SELECT to_regclass('public.account_deletion_requests') AS value")).rows[0]?.value, null);
    await closePostgresPool();
    closePostgresPool = databaseModule.closePostgresPool;
    assert.deepEqual(await freshProcessState({ userId: rollbackOwner.id, externalUserId: "pg14-assistance-rollback-owner" }), rollbackEnabled);
    await closePostgresPool();
    closePostgresPool = databaseModule.closePostgresPool;
    await rollback.end();
    rollback = undefined;
    await assertNoConnections(admin, rollbackName);
  } finally {
    await closePostgresPool?.();
    await target?.end();
    await rollback?.end();
    for (const [name, value] of originalEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    for (const database of databases) await dropDatabase(admin, database).catch(() => undefined);
    await admin.end();
  }
});
