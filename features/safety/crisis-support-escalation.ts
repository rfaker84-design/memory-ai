import { withPostgresTransaction } from "@/src/server/database";

/**
 * A crisis handoff never stores the user's message.  It creates a minimal
 * support-queue event only after a user has explicitly recorded the separate
 * crisis-support consent. Staffing and response SLA remain operational gates.
 */
export async function queueCrisisSupportIfAuthorized(input: {
  userId: string;
  externalUserId: string;
  memoryId: string;
  idempotencyKey: string;
}): Promise<boolean> {
  return withPostgresTransaction(async (client) => {
    const authorized = await client.query(
      `SELECT 1
         FROM public.users account
         JOIN public.consent_records consent ON consent.user_id = account.id
        WHERE account.id=$1::uuid AND account.external_id=$2
          AND consent.consent_type='crisis_support_escalation'
          AND consent.status='approved'
          AND consent.memory_id IS NULL
          AND consent.metadata ->> 'version'='commercial-trust-v1'
        LIMIT 1`,
      [input.userId, input.externalUserId],
    );
    if (authorized.rowCount !== 1) return false;
    const contacts = await client.query<{ count: string }>(
      `SELECT CASE WHEN pg_catalog.to_regclass('public.crisis_contact_consents') IS NULL THEN '0'
        ELSE (SELECT count(*)::text FROM public.crisis_contact_consents WHERE owner_user_id=$1::uuid AND status='accepted') END AS count`,
      [input.userId],
    );
    const acceptedContactCount = Number(contacts.rows[0]?.count ?? "0");
    await client.query(
      `INSERT INTO public.user_reports (reporter_user_id, request_key, category, subject_type, subject_id, requested_action, details)
       VALUES ($1::uuid, $2, 'safety', 'memory', $3::uuid, 'review', $4)
       ON CONFLICT (reporter_user_id, request_key) DO UPDATE SET request_key=EXCLUDED.request_key`,
      [input.userId, `crisis:${input.idempotencyKey}`, input.memoryId, `User-preauthorized immediate-risk support queue. No message content retained. Accepted crisis contacts: ${acceptedContactCount}. No external delivery claimed.`],
    );
    return true;
  });
}
