import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const { Client } = pg;
const adminUrlValue = process.env.ACCOUNT_DELETION_POSTGRES_GATE_ADMIN_URL;
const databaseName = process.env.ACCOUNT_DELETION_POSTGRES_GATE_DATABASE ?? "account_deletion_gate_017";
const migrations = Array.from({ length: 17 }, (_, index) => `${String(index + 1).padStart(3, "0")}_`);

function gateUrl(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function migration(index: number): Promise<string> {
  const names = await readdir(new URL("../../database/migrations/", import.meta.url));
  const name = names.find((candidate) => candidate.startsWith(migrations[index]));
  if (!name) throw new Error("MIGRATION_NOT_FOUND");
  return readFile(new URL(`../../database/migrations/${name}`, import.meta.url), "utf8");
}

async function reset(admin: InstanceType<typeof Client>, database: string): Promise<void> {
  await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [database]);
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
}

test("Migration 017 PostgreSQL 14 first-run, replay, rollback, concurrent deletion, legal hold, guardian, crash recovery and connection-zero gate", {
  skip: adminUrlValue ? false : "set ACCOUNT_DELETION_POSTGRES_GATE_ADMIN_URL to run isolated destructive PG14 gate",
  timeout: 120_000,
}, async () => {
  assert.ok(adminUrlValue);
  assert.match(new URL(adminUrlValue).hostname, /^(127\.0\.0\.1|localhost|::1)$/);
  assert.match(databaseName, /^account_deletion_gate_[a-z0-9_]+$/);
  const targetUrl = gateUrl(adminUrlValue, databaseName);
  const admin = new Client({ connectionString: adminUrlValue });
  await admin.connect();
  let target: InstanceType<typeof Client> | undefined;
  let closePostgresPool: (() => Promise<void>) | undefined;
  try {
    const version = (await admin.query<{ server_version: string }>("SHOW server_version")).rows[0]?.server_version ?? "";
    assert.match(version, /^14\./);
    await reset(admin, databaseName);
    target = new Client({ connectionString: targetUrl });
    await target.connect();
    for (let index = 0; index < 17; index += 1) await target.query(await migration(index));
    await target.query(await migration(16));
    assert.equal((await target.query("SELECT to_regclass('public.account_deletion_requests') AS value")).rows[0]?.value, "account_deletion_requests");
    assert.equal((await target.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='account_deletion_tasks' AND column_name='claimed_at'")).rowCount, 1);

    const invalidHoldUser = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pg14-invalid-hold') RETURNING id")).rows[0]!;
    await assert.rejects(target.query(
      "INSERT INTO account_deletion_requests(user_id,content_delete_after,provider_delete_after,backup_expire_after,receipt_access_hash,receipt_access_expires_at,legal_hold,legal_hold_reason,legal_hold_scope,legal_hold_approved_by,legal_hold_expires_at) VALUES ($1,NOW(),NOW(),NOW(),'x',NOW(),true,NULL,NULL,NULL,NULL)",
      [invalidHoldUser.id],
    ));

    process.env.DATABASE_URL = targetUrl;
    process.env.DATABASE_SSL = "false";
    process.env.DATABASE_POOL_MAX = "4";
    const [{ PostgresAccountDeletionService, AccountDeletionError }, { PostgresAccountDeletionWorker }, { AuthPostgresRepository }, database] = await Promise.all([
      import("./account-deletion-service"),
      import("./account-deletion-worker"),
      import("@/src/server/auth/auth-repository"),
      import("@/src/server/database"),
    ]);
    closePostgresPool = database.closePostgresPool;
    const user = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pg14-concurrent-delete') RETURNING id")).rows[0]!;
    const service = new PostgresAccountDeletionService();
    const [first, replay] = await Promise.all([
      service.request({ userId: user.id, externalUserId: "pg14-concurrent-delete", receiptToken: "a".repeat(43) }),
      service.request({ userId: user.id, externalUserId: "pg14-concurrent-delete", receiptToken: "b".repeat(43) }),
    ]);
    assert.equal(first.requestId, replay.requestId);
    assert.equal(first.status, "content_pending");
    assert.equal((await target.query("SELECT count(*)::int AS count FROM account_deletion_requests WHERE user_id=$1", [user.id])).rows[0]?.count, 1);
    assert.equal((await target.query("SELECT count(*)::int AS count FROM auth_session_invalidations WHERE user_id=$1", [user.id])).rows[0]?.count, 1);
    // A fresh SMS challenge must not mint a new Session for a user who has
    // already requested deletion. This uses the real PG repository rather
    // than merely checking that an old JWT was revoked.
    process.env.ACCOUNT_DELETION_ENABLED = "true";
    const challengeId = randomUUID();
    const auth = new AuthPostgresRepository();
    assert.equal(await auth.createChallenge({
      challengeId,
      phoneHash: "a".repeat(64),
      codeDigest: "b".repeat(64),
      purpose: "sign_in",
      expiresAt: new Date(Date.now() + 60_000),
      resendAfter: new Date(Date.now() + 1_000),
      requestIpHash: "c".repeat(64),
    }, {
      codeTtlSeconds: 300, resendSeconds: 60, phoneHourlyLimit: 100, phoneDailyLimit: 100,
      ipHourlyLimit: 100, maxAttempts: 5, sessionTtlSeconds: 3600,
      sessionClockToleranceSeconds: 30, cleanupRetentionDays: 7, cleanupBatchSize: 200,
    }), "created");
    assert.deepEqual(await auth.verifyAndConsume({
      challengeId,
      phoneHash: "a".repeat(64),
      candidateDigest: "b".repeat(64),
      externalUserId: "pg14-concurrent-delete",
      now: new Date(),
    }), { status: "account_deletion_pending" });
    const schedule = await target.query<{ kind: string; next_attempt_at: Date; content_delete_after: Date; provider_delete_after: Date; backup_expire_after: Date }>(
      `SELECT t.kind, t.next_attempt_at, r.content_delete_after, r.provider_delete_after, r.backup_expire_after
       FROM account_deletion_tasks t JOIN account_deletion_requests r ON r.id=t.deletion_request_id
       WHERE t.deletion_request_id=$1 AND t.kind IN ('cos_provider','backup_retention') ORDER BY t.kind`,
      [first.requestId],
    );
    assert.deepEqual(schedule.rows.map((row) => ({ kind: row.kind, scheduled: row.next_attempt_at.toISOString(), expected: (row.kind === "cos_provider" ? row.provider_delete_after : row.backup_expire_after).toISOString() })), [
      { kind: "backup_retention", scheduled: schedule.rows[0]!.backup_expire_after.toISOString(), expected: schedule.rows[0]!.backup_expire_after.toISOString() },
      { kind: "cos_provider", scheduled: schedule.rows[1]!.provider_delete_after.toISOString(), expected: schedule.rows[1]!.provider_delete_after.toISOString() },
    ]);

    const guardianAccount = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pg14-guardian-account') RETURNING id")).rows[0]!;
    const guardian = (await target.query<{ id: string }>("INSERT INTO users(external_id, profile) VALUES ('pg14-guardian-delete', $1::jsonb) RETURNING id", [JSON.stringify({ guardian_deletion_confirmation_required: true, guardian_user_id: guardianAccount.id })])).rows[0]!;
    await assert.rejects(
      service.request({ userId: guardian.id, externalUserId: "pg14-guardian-delete", receiptToken: "c".repeat(43) }),
      (error: unknown) => error instanceof AccountDeletionError && error.code === "GUARDIAN_CONFIRMATION_REQUIRED",
    );
    await service.confirmGuardian({ dependentUserId: guardian.id, guardianUserId: guardianAccount.id, guardianExternalUserId: "pg14-guardian-account" });
    const guardianRequest = await service.request({ userId: guardian.id, externalUserId: "pg14-guardian-delete", receiptToken: "d".repeat(43) });
    assert.equal((await target.query("SELECT guardian_confirmed_at IS NOT NULL AS confirmed FROM account_deletion_requests WHERE id=$1", [guardianRequest.requestId])).rows[0]?.confirmed, true);

    await target.query("UPDATE account_deletion_tasks SET status='completed', completed_at=NOW(), claimed_at=NULL WHERE deletion_request_id=$1 AND kind <> 'revoke_sessions'", [first.requestId]);
    await target.query("UPDATE account_deletion_tasks SET status='running', claimed_at=NOW()-INTERVAL '11 minutes' WHERE deletion_request_id=$1 AND kind='revoke_sessions'", [first.requestId]);
    assert.equal(await new PostgresAccountDeletionWorker().runOnce(), "completed");
    const recovered = await target.query<{ status: string; attempt_count: number; claimed_at: Date | null }>("SELECT status, attempt_count, claimed_at FROM account_deletion_tasks WHERE deletion_request_id=$1 AND kind='revoke_sessions'", [first.requestId]);
    assert.deepEqual(recovered.rows[0] && { status: recovered.rows[0].status, attemptCount: recovered.rows[0].attempt_count, claimedAt: recovered.rows[0].claimed_at }, { status: "completed", attemptCount: 1, claimedAt: null });

    await target.query("UPDATE account_deletion_requests SET status='legal_hold', legal_hold=true, legal_hold_reason='open-dispute', legal_hold_scope=ARRAY['refund_dispute'], legal_hold_approved_by='compliance-approver', legal_hold_expires_at=NOW()+INTERVAL '1 day' WHERE id=$1", [first.requestId]);
    await target.query("UPDATE account_deletion_tasks SET status='retry', next_attempt_at=NOW() WHERE deletion_request_id=$1 AND kind='content_online'", [first.requestId]);
    await target.query("UPDATE account_deletion_tasks SET status='completed', completed_at=NOW(), claimed_at=NULL WHERE deletion_request_id=$1", [guardianRequest.requestId]);
    assert.equal(await new PostgresAccountDeletionWorker().runOnce(), "idle");
    assert.equal((await target.query("SELECT status FROM account_deletion_tasks WHERE deletion_request_id=$1 AND kind='content_online'", [first.requestId])).rows[0]?.status, "retry");
    await target.query("UPDATE account_deletion_requests SET legal_hold_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [first.requestId]);
    const resumedWorker = new PostgresAccountDeletionWorker();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = await resumedWorker.runOnce();
      assert.notEqual(result, "retry");
      if ((await target.query("SELECT status FROM account_deletion_tasks WHERE deletion_request_id=$1 AND kind='content_online'", [first.requestId])).rows[0]?.status === "completed") break;
    }
    assert.equal((await target.query("SELECT status FROM account_deletion_tasks WHERE deletion_request_id=$1 AND kind='content_online'", [first.requestId])).rows[0]?.status, "completed");
    assert.deepEqual((await target.query("SELECT legal_hold, status FROM account_deletion_requests WHERE id=$1", [first.requestId])).rows[0], { legal_hold: false, status: "content_pending" });

    const progressUser = (await target.query<{ id: string }>("INSERT INTO users(external_id) VALUES ('pg14-progress-delete') RETURNING id")).rows[0]!;
    const progressRequest = await service.request({ userId: progressUser.id, externalUserId: "pg14-progress-delete", receiptToken: "e".repeat(43) });
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await resumedWorker.runOnce();
      if ((await target.query("SELECT status FROM account_deletion_tasks WHERE deletion_request_id=$1 AND kind='content_online'", [progressRequest.requestId])).rows[0]?.status === "completed") break;
    }
    assert.equal((await target.query("SELECT status FROM account_deletion_tasks WHERE deletion_request_id=$1 AND kind='content_online'", [progressRequest.requestId])).rows[0]?.status, "completed");
    assert.equal((await target.query("SELECT status FROM account_deletion_requests WHERE id=$1", [progressRequest.requestId])).rows[0]?.status, "provider_pending");

    await closePostgresPool();
    closePostgresPool = undefined;
    await target.end();
    target = undefined;
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [databaseName])).rows[0]?.count, 0);

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
  } finally {
    await closePostgresPool?.();
    await target?.end();
    await admin.end();
  }
});
