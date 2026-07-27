import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import pg from "pg";

import {
  closePostgresPool,
} from "../../src/server/database";
import { getCommerceProduct } from "./catalog";
import { CommercePostgresDataSource } from "./commerce-postgres-datasource";

const { Client } = pg;
const adminUrlValue = process.env.COMMERCE_POSTGRES_GATE_ADMIN_URL;
const gateDatabase =
  process.env.COMMERCE_POSTGRES_GATE_DATABASE
  ?? "commerce_gate_migration014";
const rollbackDatabase = `${gateDatabase}_rollback`;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function databaseUrl(adminUrl: URL, database: string): string {
  const target = new URL(adminUrl);
  target.pathname = `/${database}`;
  return target.toString();
}

function assertIsolatedTarget(adminUrl: URL): void {
  assert.match(
    adminUrl.hostname,
    /^(127\.0\.0\.1|localhost|::1)$/,
    "migration gate refuses non-loopback PostgreSQL",
  );
  assert.match(
    gateDatabase,
    /^commerce_gate_[a-z0-9_]+$/,
    "migration gate database must use the commerce_gate_ prefix",
  );
  assert.equal(
    process.env.COMMERCE_POSTGRES_GATE_ALLOW_DROP,
    "YES",
    "migration gate requires an explicit disposable-database acknowledgement",
  );
}

async function resetDatabase(
  admin: InstanceType<typeof Client>,
  database: string,
): Promise<void> {
  assert.match(database, /^commerce_gate_[a-z0-9_]+$/);
  await admin.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [database],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
}

async function migrationSql(number: number): Promise<string> {
  const padded = String(number).padStart(3, "0");
  const directory = new URL("../../database/migrations/", import.meta.url);
  const entries = [
    "001_memoryai_core.sql",
    "002_memoryai_indexes.sql",
    "003_memoryai_constraints.sql",
    "004_media_storage_foundation.sql",
    "005_memory_creation_idempotency.sql",
    "006_auth_verification_challenges.sql",
    "007_long_term_memories.sql",
    "008_memory_first_greetings.sql",
    "009_memory_chat_turn_idempotency.sql",
    "010_memory_experience_payments.sql",
    "011_business_funnel_events.sql",
    "012_payment_refund_requests.sql",
    "013_wechat_auth_identities.sql",
    "014_commerce_credits_referrals.sql",
  ];
  const name = entries.find((entry) => entry.startsWith(`${padded}_`));
  assert.ok(name, `migration ${padded} is registered in the isolated gate`);
  return readFile(new URL(name, directory), "utf8");
}

async function applyMigrations(
  client: InstanceType<typeof Client>,
  first: number,
  last: number,
): Promise<void> {
  for (let number = first; number <= last; number += 1) {
    await client.query(await migrationSql(number));
  }
}

async function scalarCount(
  client: InstanceType<typeof Client>,
  sql: string,
  values: readonly unknown[] = [],
): Promise<number> {
  const result = await client.query<{ count: string }>(sql, [...values]);
  return Number(result.rows[0]?.count ?? 0);
}

test(
  "Migration 014 isolated PostgreSQL gate",
  {
    skip: adminUrlValue
      ? false
      : "set COMMERCE_POSTGRES_GATE_ADMIN_URL to run the destructive isolated gate",
    timeout: 120_000,
  },
  async (t) => {
    assert.ok(adminUrlValue);
    const adminUrl = new URL(adminUrlValue);
    assertIsolatedTarget(adminUrl);

    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await resetDatabase(admin, gateDatabase);
    await resetDatabase(admin, rollbackDatabase);
    const version = (
      await admin.query<{ server_version: string }>(
        "SELECT current_setting('server_version') AS server_version",
      )
    ).rows[0].server_version;
    await admin.end();

    const targetUrl = databaseUrl(adminUrl, gateDatabase);
    const target = new Client({ connectionString: targetUrl });
    await target.connect();
    await applyMigrations(target, 1, 14);

    const commerceTables = await scalarCount(
      target,
      `SELECT COUNT(*)::text AS count
       FROM pg_class
       WHERE relnamespace = 'public'::regnamespace
         AND relkind = 'r'
         AND relname LIKE 'commerce_%'`,
    );
    assert.equal(commerceTables, 10);

    await target.query(await migrationSql(14));
    assert.equal(
      await scalarCount(
        target,
        `SELECT COUNT(*)::text AS count
         FROM pg_class
         WHERE relnamespace = 'public'::regnamespace
           AND relkind = 'r'
           AND relname LIKE 'commerce_%'`,
      ),
      10,
      "014 replay is idempotent",
    );

    const postflight = await readFile(
      new URL(
        "../../database/verification/014-commerce-credits-referrals-postflight.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await target.query(postflight);

    const metadata = (
      await target.query<{
        constraints: string;
        foreign_keys: string;
        indexes: string;
      }>(
        `SELECT
           (
             SELECT COUNT(*)::text
             FROM pg_constraint
             WHERE connamespace = 'public'::regnamespace
               AND conrelid IN (
                 SELECT oid FROM pg_class
                 WHERE relnamespace = 'public'::regnamespace
                   AND relname LIKE 'commerce_%'
               )
           ) AS constraints,
           (
             SELECT COUNT(*)::text
             FROM pg_constraint
             WHERE connamespace = 'public'::regnamespace
               AND contype = 'f'
               AND convalidated
               AND conrelid IN (
                 SELECT oid FROM pg_class
                 WHERE relnamespace = 'public'::regnamespace
                   AND relname LIKE 'commerce_%'
               )
           ) AS foreign_keys,
           (
             SELECT COUNT(*)::text
             FROM pg_index index_state
             JOIN pg_class table_class ON table_class.oid = index_state.indrelid
             WHERE table_class.relnamespace = 'public'::regnamespace
               AND table_class.relname LIKE 'commerce_%'
               AND index_state.indisvalid
               AND index_state.indisready
           ) AS indexes`,
      )
    ).rows[0];

    const rollback = new Client({
      connectionString: databaseUrl(adminUrl, rollbackDatabase),
    });
    await rollback.connect();
    await applyMigrations(rollback, 1, 13);
    const injectedFailure = (await migrationSql(14)).replace(
      /COMMIT;\s*$/,
      "SELECT 1 / 0;\nCOMMIT;\n",
    );
    await assert.rejects(
      rollback.query(injectedFailure),
      (error: unknown) =>
        Boolean(
          error
          && typeof error === "object"
          && (error as { code?: string }).code === "22012",
        ),
    );
    await rollback.query("ROLLBACK");
    assert.equal(
      await scalarCount(
        rollback,
        `SELECT COUNT(*)::text AS count
         FROM pg_class
         WHERE relnamespace = 'public'::regnamespace
           AND relkind = 'r'
           AND relname LIKE 'commerce_%'`,
      ),
      0,
      "failed 014 must roll back every commerce table",
    );
    assert.equal(
      (
        await rollback.query<{ core_exists: boolean }>(
          "SELECT to_regclass('public.users') IS NOT NULL AS core_exists",
        )
      ).rows[0].core_exists,
      true,
      "014 rollback must not damage the already committed core",
    );
    await rollback.end();

    const ownerA = `phone:${sha256("commerce-gate-owner-a")}`;
    const ownerB = `phone:${sha256("commerce-gate-owner-b")}`;
    const invitees = [1, 2, 3, 4].map(
      (number) => `phone:${sha256(`commerce-gate-invitee-${number}`)}`,
    );
    const externalUsers = [ownerA, ownerB, ...invitees];
    await target.query(
      `INSERT INTO public.users (external_id)
       SELECT unnest($1::text[])`,
      [externalUsers],
    );

    const userRows = await target.query<{
      id: string;
      external_id: string;
    }>(
      "SELECT id, external_id FROM public.users WHERE external_id = ANY($1::text[])",
      [externalUsers],
    );
    const userIds = new Map(
      userRows.rows.map((row) => [row.external_id, row.id]),
    );

    async function createMemory(
      externalUserId: string,
      name: string,
      key: string,
    ): Promise<string> {
      const result = await target.query<{ id: string }>(
        `INSERT INTO public.memories (
           user_id, name, idempotency_key, creation_idempotency_key
         ) VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          userIds.get(externalUserId),
          name,
          sha256(`legacy-${key}`),
          `commerce:gate:memory:${key}`,
        ],
      );
      return result.rows[0].id;
    }

    const memoryA1 = await createMemory(ownerA, "TA-A1", "owner-a-first");
    const memoryA2 = await createMemory(ownerA, "TA-A2", "owner-a-second");
    const memoryB1 = await createMemory(ownerB, "TA-B1", "owner-b-first");
    await target.end();

    Object.assign(process.env, {
      NODE_ENV: "test",
      DATABASE_URL: targetUrl,
      DATABASE_SSL: "false",
      DATABASE_POOL_MAX: "24",
    });

    const commerce = new CommercePostgresDataSource();
    const product = getCommerceProduct("memory_video_49");
    const orderInput = {
      externalUserId: ownerA,
      requestKey: "commerce:gate:order:0001",
      product,
      platform: "web" as const,
      paymentRail: "test" as const,
    };
    const concurrentOrders = await Promise.all(
      Array.from({ length: 8 }, () => commerce.createOrder(orderInput)),
    );
    assert.equal(new Set(concurrentOrders.map((order) => order.id)).size, 1);
    const commerceOrder = concurrentOrders[0];

    const paymentEvent = {
      eventId: "commerce-gate-payment-event-0001",
      kind: "payment" as const,
      orderNo: commerceOrder.orderNo,
      transactionId: "commerce-gate-test-transaction-0001",
      status: "succeeded" as const,
      amountFen: product.priceFen,
      payloadHash: sha256("commerce-gate-payment-payload-0001"),
    };
    const paymentResults = await Promise.all(
      Array.from(
        { length: 16 },
        () => commerce.applyPaymentEvent("test", paymentEvent),
      ),
    );
    assert.equal(
      paymentResults.filter((result) => result.outcome === "paid").length,
      1,
    );
    assert.equal(
      paymentResults.filter((result) => result.outcome === "duplicate").length,
      15,
    );

    const previewRequest = {
      externalUserId: ownerA,
      memoryId: memoryA1,
      requestKey: "commerce:gate:preview:0001",
      generationKey: "commerce:gate:generation:preview:0001",
      purpose: "first_preview" as const,
    };
    const previewReservations = await Promise.all(
      Array.from(
        { length: 16 },
        () => commerce.reserveGeneration(previewRequest),
      ),
    );
    assert.equal(
      new Set(previewReservations.map((reservation) => reservation.id)).size,
      1,
      "concurrent reservation must create one ledger row",
    );

    await closePostgresPool();
    const recovered = await Promise.all(
      Array.from({ length: 12 }, () =>
        new CommercePostgresDataSource().recoverGeneration(
          ownerA,
          previewRequest.requestKey,
        )),
    );
    assert.equal(
      new Set(recovered.map((reservation) => reservation?.id)).size,
      1,
      "recovery replay must not create another reservation",
    );
    assert.equal(recovered[0]?.id, previewReservations[0].id);

    const previewSettlements = await Promise.all(
      Array.from({ length: 16 }, () =>
        commerce.settleGeneration({
          externalUserId: ownerA,
          requestKey: previewRequest.requestKey,
          outcome: "succeeded",
        })),
    );
    assert.equal(
      new Set(previewSettlements.map((reservation) => reservation.id)).size,
      1,
    );
    assert.equal(
      await commerce.canSaveGeneration(ownerA, previewRequest.generationKey),
      true,
    );
    assert.equal(
      await commerce.canSaveGeneration(ownerB, previewRequest.generationKey),
      false,
    );

    const paidRequest = {
      externalUserId: ownerA,
      memoryId: memoryA1,
      requestKey: "commerce:gate:paid-generation:0001",
      generationKey: "commerce:gate:generation:paid:0001",
      purpose: "new_video" as const,
    };
    const paidReservations = await Promise.all(
      Array.from(
        { length: 24 },
        () => commerce.reserveGeneration(paidRequest),
      ),
    );
    assert.equal(
      new Set(paidReservations.map((reservation) => reservation.id)).size,
      1,
    );
    await Promise.all(
      Array.from({ length: 24 }, () =>
        commerce.settleGeneration({
          externalUserId: ownerA,
          requestKey: paidRequest.requestKey,
          outcome: "succeeded",
        })),
    );

    const failedRequest = {
      externalUserId: ownerA,
      memoryId: memoryA2,
      requestKey: "commerce:gate:failed-generation:0001",
      generationKey: "commerce:gate:generation:failed:0001",
      purpose: "new_video" as const,
    };
    await commerce.reserveGeneration(failedRequest);
    await Promise.all(
      Array.from({ length: 12 }, () =>
        commerce.settleGeneration({
          externalUserId: ownerA,
          requestKey: failedRequest.requestKey,
          outcome: "system_failed",
        })),
    );
    const balanceAfterFailure = await commerce.getCreditBalance(ownerA);
    assert.equal(balanceAfterFailure.paidAvailable, 1);

    assert.equal(
      await commerce.recoverGeneration(ownerB, paidRequest.requestKey),
      null,
    );
    await assert.rejects(
      commerce.reserveGeneration({
        ...paidRequest,
        externalUserId: ownerB,
        requestKey: "commerce:gate:cross-user:0001",
        generationKey: "commerce:gate:generation:cross-user:0001",
      }),
    );
    await assert.rejects(
      commerce.reserveGeneration({
        ...previewRequest,
        memoryId: memoryA2,
        requestKey: "commerce:gate:second-ta-preview:0001",
        generationKey: "commerce:gate:generation:second-ta:0001",
      }),
    );

    const remedyInput = {
      externalUserId: ownerA,
      memoryId: memoryA1,
      requestKey: "commerce:gate:photo-remedy:0001",
      originalGenerationKey: previewRequest.generationKey,
      replacementPhotoDigest: sha256("commerce-gate-replacement-photo"),
    };
    const remedies = await Promise.all(
      Array.from(
        { length: 8 },
        () => commerce.requestPhotoRemedy(remedyInput),
      ),
    );
    assert.equal(remedies.every((remedy) => remedy.granted), true);
    await assert.rejects(
      commerce.requestPhotoRemedy({
        ...remedyInput,
        memoryId: memoryA2,
        requestKey: "commerce:gate:photo-remedy:wrong-ta",
      }),
    );

    const referralCode = await commerce.createReferralCode({
      externalUserId: ownerA,
      requestKey: "commerce:gate:referral-code:0001",
      code: "ABCDEFGH23",
    });
    const referralInputs = invitees.slice(0, 3).map((invitee, index) => ({
      inviteeExternalUserId: invitee,
      requestKey: `commerce:gate:referral:${index + 1}:0001`,
      code: referralCode.code,
      deviceKeyHash: sha256(`commerce-gate-device-${index + 1}`),
    }));
    const firstQualifications = await Promise.all(
      Array.from(
        { length: 8 },
        () => commerce.qualifyReferral(referralInputs[0]),
      ),
    );
    assert.equal(
      new Set(
        firstQualifications.map(
          (qualification) => qualification.inviteeExternalUserId,
        ),
      ).size,
      1,
    );
    await Promise.all(
      referralInputs.slice(1).map((input) => commerce.qualifyReferral(input)),
    );
    const referralStatus = await commerce.getReferralStatus(ownerA);
    assert.equal(referralStatus.qualifiedInvitees, 3);
    assert.equal(referralStatus.rewardsGranted, 1);
    assert.equal((await commerce.getCreditBalance(ownerA)).referralAvailable, 1);
    await commerce.qualifyReferral(referralInputs[2]);
    assert.equal((await commerce.getReferralStatus(ownerA)).rewardsGranted, 1);
    await assert.rejects(
      commerce.qualifyReferral({
        inviteeExternalUserId: invitees[3],
        requestKey: "commerce:gate:referral:fraud:0001",
        code: referralCode.code,
        deviceKeyHash: referralInputs[0].deviceKeyHash,
      }),
    );

    const refundInput = {
      externalUserId: ownerA,
      orderNo: commerceOrder.orderNo,
      requestKey: "commerce:gate:refund:0001",
      reason: "service_failure" as const,
    };
    const refundRequests = await Promise.all(
      Array.from({ length: 12 }, () => commerce.requestRefund(refundInput)),
    );
    assert.equal(new Set(refundRequests.map((refund) => refund.id)).size, 1);
    await assert.rejects(
      commerce.requestRefund({
        ...refundInput,
        requestKey: "commerce:gate:refund:conflict",
        reason: "unused_purchase",
      }),
    );

    const refundEvent = {
      eventId: "commerce-gate-refund-event-0001",
      kind: "refund" as const,
      orderNo: commerceOrder.orderNo,
      refundRequestNo: refundRequests[0].requestNo,
      transactionId: paymentEvent.transactionId,
      status: "refunded" as const,
      amountFen: product.priceFen,
      payloadHash: sha256("commerce-gate-refund-payload-0001"),
    };
    const refundResults = await Promise.all(
      Array.from(
        { length: 16 },
        () => commerce.applyPaymentEvent("test", refundEvent),
      ),
    );
    assert.equal(
      refundResults.filter((result) => result.outcome === "refunded").length,
      1,
    );
    assert.equal(
      refundResults.filter((result) => result.outcome === "duplicate").length,
      15,
    );
    assert.deepEqual((await commerce.reconcileOrders()).issues, []);

    const verification = new Client({ connectionString: targetUrl });
    await verification.connect();
    const ledgerCounts = (
      await verification.query<{
        orders: string;
        payment_events: string;
        refund_requests: string;
        generation_rows: string;
        referral_qualifications: string;
        referral_rewards: string;
      }>(
        `SELECT
           (SELECT COUNT(*)::text FROM commerce_orders) AS orders,
           (SELECT COUNT(*)::text FROM commerce_order_events) AS payment_events,
           (SELECT COUNT(*)::text FROM commerce_refund_requests) AS refund_requests,
           (SELECT COUNT(*)::text FROM commerce_generation_reservations) AS generation_rows,
           (SELECT COUNT(*)::text FROM commerce_referral_qualifications) AS referral_qualifications,
           (SELECT COUNT(*)::text FROM commerce_referral_rewards) AS referral_rewards`,
      )
    ).rows[0];
    assert.deepEqual(ledgerCounts, {
      orders: "1",
      payment_events: "2",
      refund_requests: "1",
      generation_rows: "3",
      referral_qualifications: "3",
      referral_rewards: "1",
    });

    const paidLot = (
      await verification.query<{ id: string }>(
        `SELECT id FROM commerce_credit_lots
         WHERE source_kind = 'paid_package' LIMIT 1`,
      )
    ).rows[0];
    await verification.query("BEGIN");
    await assert.rejects(
      verification.query(
        `INSERT INTO commerce_generation_reservations (
           user_id, memory_id, credit_lot_id, request_key,
           generation_key, purpose
         ) VALUES ($1, $2, $3, $4, $5, 'new_video')`,
        [
          userIds.get(ownerB),
          memoryB1,
          paidLot.id,
          "commerce:gate:db-cross-user:0001",
          "commerce:gate:db-cross-generation:0001",
        ],
      ),
      (error: unknown) =>
        Boolean(
          error
          && typeof error === "object"
          && (error as { code?: string }).code === "23503",
        ),
    );
    await verification.query("ROLLBACK");
    await verification.query(postflight);
    await verification.end();
    await closePostgresPool();

    t.diagnostic(
      JSON.stringify({
        serverVersion: version,
        migrationsApplied: "001-014",
        migration014Replay: "accepted-idempotently",
        commerceTables,
        constraints: Number(metadata.constraints),
        validatedForeignKeys: Number(metadata.foreign_keys),
        validIndexes: Number(metadata.indexes),
        concurrency: {
          orderAttempts: 8,
          paymentCallbackAttempts: 16,
          generationReserveAttempts: 24,
          generationSettleAttempts: 24,
          recoveryAttempts: 12,
          refundRequestAttempts: 12,
          refundCallbackAttempts: 16,
        },
        ledgerCounts,
        rollbackProbe: "014 DDL fully rolled back; 001-013 core preserved",
      }),
    );
  },
);
