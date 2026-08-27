import { queryPostgres } from "@/src/server/database";
import { isAtLeast18 } from "@/features/account-profile/adult-eligibility";

export const TRUST_CONSENT_VERSION = "commercial-trust-v1";

export type TrustConsentType =
  | "adult_eligibility"
  | "memory_profile"
  | "media_asset"
  | "voice_clone"
  | "commercial_use"
  | "crisis_support_escalation";

export function hasAdultBirthDate(value: unknown): boolean {
  return typeof value === "string" && isAtLeast18(value);
}

/**
 * Account-level consent required before a Memory/TA can be created.  This is
 * deliberately verified on the server: a browser acknowledgement alone is
 * not an authorization boundary.
 */
export async function hasApprovedMemoryConsent(
  input: {
    externalUserId: string;
    consentType: TrustConsentType;
    memoryId: string;
  }
): Promise<boolean> {
  const result = await queryPostgres(
    `SELECT account.profile ->> 'birth_date' AS birth_date
       FROM consent_records consent
       INNER JOIN users account ON account.id = consent.user_id
       INNER JOIN memories memory
          ON memory.id = $3 AND memory.user_id = account.id
      WHERE account.external_id = $1
        AND consent.consent_type = $2
        AND consent.status = 'approved'
        AND consent.memory_id = $3
        AND consent.metadata ->> 'version' = $4
      LIMIT 1`,
    [
      input.externalUserId,
      input.consentType,
      input.memoryId,
      TRUST_CONSENT_VERSION,
    ]
  );

  return hasAdultBirthDate((result.rows[0] as { birth_date?: unknown } | undefined)?.birth_date);
}

export async function hasApprovedMemoryProfileConsent(
  externalUserId: string
): Promise<boolean> {
  const result = await queryPostgres(
    `SELECT 1
       FROM consent_records consent
       INNER JOIN users account ON account.id = consent.user_id
      WHERE account.external_id = $1
        AND consent.consent_type = 'memory_profile'
        AND consent.status = 'approved'
        AND consent.memory_id IS NULL
        AND consent.metadata ->> 'version' = $2
      LIMIT 1`,
    [externalUserId, TRUST_CONSENT_VERSION]
  );

  return Boolean(result.rows[0]);
}

/** Both records are server-persisted before a TA can be created. This is an
 * adult self-attestation, not government identity or guardian verification. */
export async function hasApprovedMemoryCreationConsents(externalUserId: string): Promise<boolean> {
  const result = await queryPostgres(
    `SELECT count(DISTINCT consent.consent_type) AS count,
            account.profile ->> 'birth_date' AS birth_date
       FROM consent_records consent
       INNER JOIN users account ON account.id = consent.user_id
      WHERE account.external_id = $1
        AND consent.consent_type IN ('memory_profile', 'adult_eligibility')
        AND consent.status = 'approved'
        AND consent.memory_id IS NULL
        AND consent.metadata ->> 'version' = $2
      GROUP BY account.profile`,
    [externalUserId, TRUST_CONSENT_VERSION],
  );
  const account = result.rows[0] as { count?: string; birth_date?: string | null } | undefined;
  return Number(account?.count ?? 0) === 2
    && typeof account?.birth_date === "string"
    && isAtLeast18(account.birth_date);
}
