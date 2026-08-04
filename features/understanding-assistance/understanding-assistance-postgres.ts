import { withPostgresTransaction } from "@/src/server/database";

import {
  type HighRiskOperation,
  type UnderstandingAssistanceState,
  UNDERSTANDING_ASSISTANCE_VERSION,
} from "./understanding-assistance";

export class UnderstandingAssistanceError extends Error {
  constructor(readonly code: "UNDERSTANDING_ASSISTANCE_REQUIRED" | "GUARDIAN_CONFIRMATION_REQUIRED" | "ACCOUNT_NOT_FOUND") {
    super(code);
  }
}

export type UnderstandingAssistanceGuard = {
  assertHighRiskAllowed(input: { userId: string; externalUserId: string; operation: HighRiskOperation }): Promise<void>;
};

/** Route tests inject a guard explicitly. Runtime defaults are always
 * database-backed and therefore fail closed if the dependency is unavailable. */
export function defaultUnderstandingAssistanceGuard(): UnderstandingAssistanceGuard {
  return new PostgresUnderstandingAssistanceService();
}

type AccountRow = { id: string; guardianRequired: boolean };
type StateRow = { updated_at: Date };

const disabledState: UnderstandingAssistanceState = {
  enabled: false,
  confirmationVersion: null,
  updatedAt: null,
};

/**
 * Uses the existing consent ledger, not a diagnostic profile or a new
 * guardianship model. Only a version and timestamp are kept; no request text
 * or health/capacity inference is written.
 */
export class PostgresUnderstandingAssistanceService implements UnderstandingAssistanceGuard {
  async read(input: { userId: string; externalUserId: string }): Promise<UnderstandingAssistanceState> {
    return withPostgresTransaction(async (client) => {
      const row = await client.query<StateRow>(
        `SELECT consent.updated_at
           FROM public.consent_records consent
           JOIN public.users account ON account.id=consent.user_id
          WHERE account.id=$1::uuid AND account.external_id=$2
            AND consent.consent_type='understanding_assistance'
            AND consent.memory_id IS NULL AND consent.status='approved'
            AND consent.metadata ->> 'version'=$3
          ORDER BY consent.updated_at DESC LIMIT 1`,
        [input.userId, input.externalUserId, UNDERSTANDING_ASSISTANCE_VERSION],
      );
      const state = row.rows[0];
      return state
        ? { enabled: true, confirmationVersion: UNDERSTANDING_ASSISTANCE_VERSION, updatedAt: state.updated_at.toISOString() }
        : disabledState;
    });
  }

  async enable(input: { userId: string; externalUserId: string; requestKey: string; now?: Date }): Promise<UnderstandingAssistanceState> {
    const now = input.now ?? new Date();
    return withPostgresTransaction(async (client) => {
      const account = await client.query<{ id: string }>(
        "SELECT id FROM public.users WHERE id=$1::uuid AND external_id=$2 FOR UPDATE",
        [input.userId, input.externalUserId],
      );
      if (account.rowCount !== 1) throw new UnderstandingAssistanceError("ACCOUNT_NOT_FOUND");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`memoryai:understanding-assistance:${input.userId}`]);
      await client.query(
        `UPDATE public.consent_records SET status='revoked', updated_at=$2
          WHERE user_id=$1::uuid AND consent_type='understanding_assistance' AND memory_id IS NULL AND status='approved'`,
        [input.userId, now],
      );
      await client.query(
        `INSERT INTO public.consent_records (user_id, memory_id, consent_type, status, notes, metadata, created_at, updated_at)
         VALUES ($1::uuid, NULL, 'understanding_assistance', 'approved', $2, $3::jsonb, $4, $4)`,
        [input.userId, UNDERSTANDING_ASSISTANCE_VERSION, JSON.stringify({ version: UNDERSTANDING_ASSISTANCE_VERSION, requestKey: input.requestKey }), now],
      );
      return { enabled: true, confirmationVersion: UNDERSTANDING_ASSISTANCE_VERSION, updatedAt: now.toISOString() };
    }, { preserveError: (error) => error instanceof UnderstandingAssistanceError });
  }

  async revoke(input: { userId: string; externalUserId: string; now?: Date }): Promise<UnderstandingAssistanceState> {
    const now = input.now ?? new Date();
    return withPostgresTransaction(async (client) => {
      const changed = await client.query(
        `UPDATE public.consent_records SET status='revoked', updated_at=$3
          WHERE user_id=$1::uuid AND consent_type='understanding_assistance' AND memory_id IS NULL
            AND status='approved' AND metadata ->> 'version'=$4
            AND EXISTS (SELECT 1 FROM public.users account WHERE account.id=$1::uuid AND account.external_id=$2)`,
        [input.userId, input.externalUserId, now, UNDERSTANDING_ASSISTANCE_VERSION],
      );
      if (changed.rowCount === 0) {
        const account = await client.query("SELECT 1 FROM public.users WHERE id=$1::uuid AND external_id=$2", [input.userId, input.externalUserId]);
        if (account.rowCount !== 1) throw new UnderstandingAssistanceError("ACCOUNT_NOT_FOUND");
      }
      return disabledState;
    }, { preserveError: (error) => error instanceof UnderstandingAssistanceError });
  }

  async assertHighRiskAllowed(input: { userId: string; externalUserId: string; operation: HighRiskOperation }): Promise<void> {
    await withPostgresTransaction(async (client) => {
      const account = await client.query<AccountRow>(
        `SELECT id, COALESCE((profile ->> 'guardian_deletion_confirmation_required')::boolean, false) AS "guardianRequired"
           FROM public.users WHERE id=$1::uuid AND external_id=$2 FOR KEY SHARE`,
        [input.userId, input.externalUserId],
      );
      const owner = account.rows[0];
      if (!owner) throw new UnderstandingAssistanceError("ACCOUNT_NOT_FOUND");
      const assistance = await client.query(
        `SELECT 1 FROM public.consent_records
          WHERE user_id=$1::uuid AND consent_type='understanding_assistance' AND memory_id IS NULL
            AND status='approved' AND metadata ->> 'version'=$2 LIMIT 1`,
        [input.userId, UNDERSTANDING_ASSISTANCE_VERSION],
      );
      if (assistance.rowCount === 1) throw new UnderstandingAssistanceError("UNDERSTANDING_ASSISTANCE_REQUIRED");
      if (owner.guardianRequired) {
        const guardian = await client.query(
          `SELECT 1 FROM public.account_deletion_guardian_confirmations
            WHERE dependent_user_id=$1::uuid AND expires_at > NOW()
              AND confirmation_method='verified_guardian_session' LIMIT 1`,
          [input.userId],
        );
        if (guardian.rowCount !== 1) throw new UnderstandingAssistanceError("GUARDIAN_CONFIRMATION_REQUIRED");
      }
    }, { preserveError: (error) => error instanceof UnderstandingAssistanceError });
  }
}
