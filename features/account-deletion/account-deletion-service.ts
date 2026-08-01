import { createHash } from "node:crypto";

import { withPostgresTransaction } from "@/src/server/database";

export const ACCOUNT_DELETION_CONFIRMATION = "DELETE_ACCOUNT";
export const ACCOUNT_DELETION_TASK_KINDS = [
  "revoke_sessions",
  "content_online",
  "cos_provider",
  "backup_retention",
  "financial_archive",
  "audit_receipt",
] as const;

type DeletionTaskKind = (typeof ACCOUNT_DELETION_TASK_KINDS)[number];
type DeletionStatus = "requested" | "content_pending" | "provider_pending" | "legal_hold" | "completed" | "failed";

export type AccountDeletionProgress = {
  requestId: string;
  status: DeletionStatus;
  requestedAt: string;
  contentDeleteAfter: string;
  providerDeleteAfter: string;
  backupExpireAfter: string;
  legalHold: boolean;
  completedAt: string | null;
  tasks: Array<{ kind: DeletionTaskKind; status: string; completedAt: string | null; completionReceiptAvailable: boolean }>;
};

export class AccountDeletionError extends Error {
  constructor(readonly code: "ACCOUNT_NOT_FOUND" | "GUARDIAN_CONFIRMATION_REQUIRED") {
    super(code);
  }
}

type DeletionRow = {
  id: string;
  status: DeletionStatus;
  requested_at: Date;
  content_delete_after: Date;
  provider_delete_after: Date;
  backup_expire_after: Date;
  legal_hold: boolean;
  completed_at: Date | null;
};

type TaskRow = { kind: DeletionTaskKind; status: string; completed_at: Date | null; receipt: Record<string, unknown> };

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function toProgress(row: DeletionRow, tasks: TaskRow[]): AccountDeletionProgress {
  return {
    requestId: row.id,
    status: row.status,
    requestedAt: row.requested_at.toISOString(),
    contentDeleteAfter: row.content_delete_after.toISOString(),
    providerDeleteAfter: row.provider_delete_after.toISOString(),
    backupExpireAfter: row.backup_expire_after.toISOString(),
    legalHold: row.legal_hold,
    completedAt: iso(row.completed_at),
    tasks: tasks.map((task) => ({ kind: task.kind, status: task.status, completedAt: iso(task.completed_at), completionReceiptAvailable: task.completed_at !== null && Object.keys(task.receipt).length > 0 })),
  };
}

const retentionSchedule = (now: Date) => ({
  content: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  provider: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  backup: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
});

/**
 * Candidate-only PostgreSQL repository.  The request, user-wide session
 * invalidation, and durable work list commit as one transaction so a crash can
 * only leave a resumable pending task, never an untracked deletion.
 */
export class PostgresAccountDeletionService {
  async request(input: { userId: string; externalUserId: string; receiptToken: string; now?: Date }): Promise<AccountDeletionProgress> {
    const now = input.now ?? new Date();
    const schedule = retentionSchedule(now);
    return withPostgresTransaction(async (client) => {
      const user = await client.query<{ id: string; guardian_required: boolean }>(
        `SELECT id, COALESCE((profile ->> 'guardian_deletion_confirmation_required')::boolean, false) AS guardian_required
         FROM public.users WHERE id = $1::uuid AND external_id = $2 FOR UPDATE`,
        [input.userId, input.externalUserId],
      );
      if (!user.rows[0]) throw new AccountDeletionError("ACCOUNT_NOT_FOUND");
      if (user.rows[0].guardian_required) throw new AccountDeletionError("GUARDIAN_CONFIRMATION_REQUIRED");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`memoryai:account-deletion:${input.userId}`]);

      const existing = await client.query<DeletionRow>(
        `SELECT id, status, requested_at, content_delete_after, provider_delete_after, backup_expire_after, legal_hold, completed_at
         FROM public.account_deletion_requests WHERE user_id = $1::uuid FOR UPDATE`, [input.userId],
      );
      let row = existing.rows[0];
      if (!row) {
        const inserted = await client.query<DeletionRow>(
          `INSERT INTO public.account_deletion_requests (
             user_id, status, requested_at, content_delete_after, provider_delete_after, backup_expire_after,
             receipt_access_hash, receipt_access_expires_at, audit_payload
           ) VALUES ($1::uuid, 'requested', $2, $3, $4, $5, $6, $7, $8::jsonb)
           RETURNING id, status, requested_at, content_delete_after, provider_delete_after, backup_expire_after, legal_hold, completed_at`,
          [input.userId, now, schedule.content, schedule.provider, schedule.backup, createHash("sha256").update(input.receiptToken).digest("hex"), schedule.backup, JSON.stringify({ policy: "account-deletion-v1", requestedBy: "reauthenticated-session" })],
        );
        row = inserted.rows[0];
        if (!row) throw new Error("ACCOUNT_DELETION_REQUEST_UNAVAILABLE");
        for (const kind of ACCOUNT_DELETION_TASK_KINDS) {
          await client.query(
            `INSERT INTO public.account_deletion_tasks (deletion_request_id, kind, idempotency_key, next_attempt_at)
             VALUES ($1::uuid, $2, $3, $4)`,
            [row.id, kind, `account-deletion:${row.id}:${kind}`, kind === "content_online" ? now : kind === "cos_provider" ? schedule.content : kind === "backup_retention" ? schedule.provider : now],
          );
        }
      }
      await client.query(
        `INSERT INTO public.auth_session_invalidations (user_id, invalid_before, invalidated_at, reason)
         VALUES ($1::uuid, $2, $2, 'account_deletion')
         ON CONFLICT (user_id) DO UPDATE SET invalid_before = GREATEST(auth_session_invalidations.invalid_before, EXCLUDED.invalid_before),
           invalidated_at = EXCLUDED.invalidated_at, reason = EXCLUDED.reason`,
        [input.userId, now],
      );
      const tasks = await client.query<TaskRow>(
        `SELECT kind, status, completed_at, receipt FROM public.account_deletion_tasks
         WHERE deletion_request_id = $1::uuid ORDER BY kind`, [row.id],
      );
      return toProgress(row, tasks.rows);
    });
  }

  async getProgress(input: { userId: string; externalUserId: string }): Promise<AccountDeletionProgress | null> {
    return withPostgresTransaction(async (client) => {
      const row = await client.query<DeletionRow>(
        `SELECT r.id, r.status, r.requested_at, r.content_delete_after, r.provider_delete_after, r.backup_expire_after, r.legal_hold, r.completed_at
         FROM public.account_deletion_requests r JOIN public.users u ON u.id = r.user_id
         WHERE r.user_id = $1::uuid AND u.external_id = $2`, [input.userId, input.externalUserId],
      );
      if (!row.rows[0]) return null;
      const tasks = await client.query<TaskRow>(
        `SELECT kind, status, completed_at, receipt FROM public.account_deletion_tasks
         WHERE deletion_request_id = $1::uuid ORDER BY kind`, [row.rows[0].id],
      );
      return toProgress(row.rows[0], tasks.rows);
    });
  }

  async getProgressByReceipt(receiptToken: string): Promise<AccountDeletionProgress | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(receiptToken)) return null;
    const tokenHash = createHash("sha256").update(receiptToken).digest("hex");
    return withPostgresTransaction(async (client) => {
      const row = await client.query<DeletionRow>(
        `SELECT id, status, requested_at, content_delete_after, provider_delete_after, backup_expire_after, legal_hold, completed_at
         FROM public.account_deletion_requests
         WHERE receipt_access_hash = $1 AND receipt_access_expires_at > NOW()`, [tokenHash],
      );
      if (!row.rows[0]) return null;
      const tasks = await client.query<TaskRow>(
        `SELECT kind, status, completed_at, receipt FROM public.account_deletion_tasks
         WHERE deletion_request_id = $1::uuid ORDER BY kind`, [row.rows[0].id],
      );
      return toProgress(row.rows[0], tasks.rows);
    });
  }
}
