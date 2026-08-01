import { queryPostgres } from "@/src/server/database";

export const TRUST_CONSENT_VERSION = "commercial-trust-v1";

export type TrustConsentType =
  | "memory_profile"
  | "media_asset"
  | "commercial_use";

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
    `SELECT 1
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

  return Boolean(result.rows[0]);
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
