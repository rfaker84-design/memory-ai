import { createHash, createHmac } from "node:crypto";

import { Pool } from "pg";

import { queryPostgres, withPostgresTransaction } from "@/src/server/database";

const ARCHIVE_VERSION = "account-deletion-financial-v1";
const DEFAULT_FINANCIAL_RETENTION_DAYS = 365 * 3;
const MAX_FINANCIAL_RETENTION_DAYS = 365 * 30;

type Environment = Readonly<Record<string, string | undefined>>;

export class FinancialArchiveConfigurationError extends Error {
  constructor(readonly code: "FINANCIAL_ARCHIVE_DATABASE_NOT_CONFIGURED" | "FINANCIAL_ARCHIVE_DATABASE_NOT_ISOLATED" | "FINANCIAL_ARCHIVE_HMAC_KEY_INVALID" | "FINANCIAL_ARCHIVE_RETENTION_INVALID") {
    super(code);
  }
}

type FinancialRecordsRow = { records: Record<string, unknown> };

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new FinancialArchiveConfigurationError("FINANCIAL_ARCHIVE_DATABASE_NOT_CONFIGURED");
  return value;
}

function archiveRetentionDays(environment: Environment): number {
  const raw = environment.ACCOUNT_DELETION_FINANCIAL_RETENTION_DAYS;
  if (!raw) return DEFAULT_FINANCIAL_RETENTION_DAYS;
  if (!/^\d+$/.test(raw)) throw new FinancialArchiveConfigurationError("FINANCIAL_ARCHIVE_RETENTION_INVALID");
  const days = Number(raw);
  if (!Number.isSafeInteger(days) || days < 1 || days > MAX_FINANCIAL_RETENTION_DAYS) {
    throw new FinancialArchiveConfigurationError("FINANCIAL_ARCHIVE_RETENTION_INVALID");
  }
  return days;
}

function assertIsolatedArchiveDatabase(environment: Environment): string {
  const applicationUrl = required(environment, "DATABASE_URL");
  const archiveUrl = required(environment, "ACCOUNT_DELETION_FINANCIAL_ARCHIVE_DATABASE_URL");
  try {
    const app = new URL(applicationUrl);
    const archive = new URL(archiveUrl);
    if (app.protocol !== "postgresql:" || archive.protocol !== "postgresql:"
      || (app.hostname === archive.hostname && app.port === archive.port && app.pathname === archive.pathname)) {
      throw new FinancialArchiveConfigurationError("FINANCIAL_ARCHIVE_DATABASE_NOT_ISOLATED");
    }
  } catch (error) {
    if (error instanceof FinancialArchiveConfigurationError) throw error;
    throw new FinancialArchiveConfigurationError("FINANCIAL_ARCHIVE_DATABASE_NOT_ISOLATED");
  }
  return archiveUrl;
}

function subjectReference(userId: string, environment: Environment): string {
  const key = environment.ACCOUNT_DELETION_FINANCIAL_ARCHIVE_HMAC_KEY;
  if (!key || Buffer.byteLength(key, "utf8") < 32) {
    throw new FinancialArchiveConfigurationError("FINANCIAL_ARCHIVE_HMAC_KEY_INVALID");
  }
  return createHmac("sha256", key).update(`memoryai:financial-archive:v1\0${userId}`).digest("hex");
}

async function collectRecords(userId: string): Promise<Record<string, unknown>> {
  const result = await queryPostgres<FinancialRecordsRow>(
    `SELECT jsonb_build_object(
       'payment_orders', COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'order_no', p.order_no, 'provider', p.provider, 'amount_fen', p.amount_fen,
         'currency', p.currency, 'product_id', p.product_id, 'status', p.status,
         'provider_transaction_id', p.provider_transaction_id, 'created_at', p.created_at,
         'paid_at', p.paid_at, 'refunded_at', p.refunded_at
       ) ORDER BY p.created_at, p.order_no) FROM public.payment_orders p WHERE p.user_id=$1::uuid), '[]'::jsonb),
       'commerce_orders', COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'order_no', o.order_no, 'payment_rail', o.payment_rail, 'amount_fen', o.amount_fen,
         'currency', o.currency, 'product_id', o.product_id, 'status', o.status,
         'provider_transaction_id', o.provider_transaction_id, 'created_at', o.created_at,
         'paid_at', o.paid_at, 'refunded_at', o.refunded_at
       ) ORDER BY o.created_at, o.order_no) FROM public.commerce_orders o WHERE o.user_id=$1::uuid), '[]'::jsonb),
       'refund_requests', COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'merchant_refund_no', r.merchant_refund_no, 'status', r.status,
         'eligibility', r.eligibility, 'decision_code', r.decision_code,
         'provider_refund_id', r.provider_refund_id, 'created_at', r.created_at,
         'requested_at', r.requested_at, 'resolved_at', r.resolved_at
       ) ORDER BY r.created_at, r.merchant_refund_no) FROM public.refund_requests r WHERE r.user_id=$1::uuid), '[]'::jsonb),
       'commerce_refund_requests', COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'request_no', r.request_no, 'status', r.status, 'reason', r.reason,
         'created_at', r.created_at, 'resolved_at', r.resolved_at
       ) ORDER BY r.created_at, r.request_no) FROM public.commerce_refund_requests r WHERE r.user_id=$1::uuid), '[]'::jsonb)
     ) AS records`,
    [userId],
  );
  return result.rows[0]?.records ?? {
    payment_orders: [], commerce_orders: [], refund_requests: [], commerce_refund_requests: [],
  };
}

/**
 * Copies only statutory financial fields into a physically separate database.
 * The caller deletes the operational source rows only after this idempotent
 * archive write succeeds.
 */
export async function archiveFinancialRecords(input: { deletionRequestId: string; userId: string; now?: Date }, environment: Environment = process.env): Promise<void> {
  const archiveUrl = assertIsolatedArchiveDatabase(environment);
  const records = await collectRecords(input.userId);
  const sourcePayload = JSON.stringify(records);
  const subjectHash = subjectReference(input.userId, environment);
  const now = input.now ?? new Date();
  const retentionUntil = new Date(now.getTime() + archiveRetentionDays(environment) * 24 * 60 * 60 * 1000);
  const pool = new Pool({
    connectionString: archiveUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    ssl: environment.ACCOUNT_DELETION_FINANCIAL_ARCHIVE_DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false,
  });
  try {
    const inserted = await pool.query(
      `INSERT INTO financial_archive.account_deletion_financial_archives
       (deletion_request_id, subject_reference_hash, archive_version, retention_until, records, source_payload_sha256)
       VALUES ($1::uuid, $2, $3, $4::timestamptz, $5::jsonb, $6)
       ON CONFLICT (deletion_request_id) DO NOTHING`,
      [input.deletionRequestId, subjectHash, ARCHIVE_VERSION, retentionUntil, sourcePayload, createHash("sha256").update(sourcePayload).digest("hex")],
    );
    if (inserted.rowCount === 0) {
      const existing = await pool.query<{ subject_reference_hash: string; archive_version: string }>(
        `SELECT subject_reference_hash, archive_version
         FROM financial_archive.account_deletion_financial_archives WHERE deletion_request_id=$1::uuid`, [input.deletionRequestId],
      );
      if (existing.rows[0]?.subject_reference_hash !== subjectHash || existing.rows[0]?.archive_version !== ARCHIVE_VERSION) {
        throw new Error("FINANCIAL_ARCHIVE_IDEMPOTENCY_CONFLICT");
      }
    }
  } finally {
    await pool.end();
  }
}

export async function purgeLiveFinancialProductRecords(userId: string): Promise<void> {
  await withPostgresTransaction(async (client) => {
    for (const statement of [
      "DELETE FROM public.payment_callback_events WHERE order_id IN (SELECT id FROM public.payment_orders WHERE user_id=$1::uuid)",
      "DELETE FROM public.memory_entitlement_usages WHERE user_id=$1::uuid",
      "DELETE FROM public.memory_entitlements WHERE user_id=$1::uuid",
      "DELETE FROM public.refund_requests WHERE user_id=$1::uuid",
      "DELETE FROM public.commerce_save_rights WHERE user_id=$1::uuid",
      "DELETE FROM public.commerce_refund_requests WHERE user_id=$1::uuid",
      "DELETE FROM public.commerce_order_events WHERE order_id IN (SELECT id FROM public.commerce_orders WHERE user_id=$1::uuid)",
      "DELETE FROM public.commerce_generation_reservations WHERE user_id=$1::uuid",
      "DELETE FROM public.commerce_credit_lots WHERE user_id=$1::uuid",
      "DELETE FROM public.commerce_orders WHERE user_id=$1::uuid",
      "DELETE FROM public.commerce_referral_rewards WHERE inviter_user_id=$1::uuid",
      "DELETE FROM public.commerce_referral_qualifications WHERE inviter_user_id=$1::uuid OR invitee_user_id=$1::uuid",
      "DELETE FROM public.commerce_referral_codes WHERE inviter_user_id=$1::uuid",
      "DELETE FROM public.payment_orders WHERE user_id=$1::uuid",
    ]) await client.query(statement, [userId]);
  });
}
