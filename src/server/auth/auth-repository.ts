import type { PoolClient } from "pg";

import { withPostgresTransaction } from "@/src/server/database/postgres";

import type { AuthPolicy } from "./config";
import { verificationDigestsEqual } from "./crypto";

export type AuthUser = {
  id: string;
  externalUserId: string;
  createdAt: string;
};

export type NewChallenge = {
  challengeId: string;
  phoneHash: string;
  /** Current-first hashes during a bounded pepper overlap. */
  phoneHashCandidates?: readonly string[];
  codeDigest: string;
  purpose: "sign_in";
  expiresAt: Date;
  resendAfter: Date;
  requestIpHash: string;
  requestIpHashCandidates?: readonly string[];
};

export type ChallengeCreateResult = "created" | "rate_limited";
export type ChallengeVerifyResult =
  | { status: "verified"; user: AuthUser }
  | { status: "invalid" };

export interface AuthRepositoryPort {
  createChallenge(input: NewChallenge, policy: AuthPolicy): Promise<ChallengeCreateResult>;
  setProviderRequestId(challengeId: string, providerRequestId: string | null): Promise<void>;
  discardChallenge(challengeId: string): Promise<void>;
  verifyAndConsume(input: {
    challengeId: string;
    phoneHash: string;
    phoneHashCandidates?: readonly string[];
    candidateDigest: string;
    candidateDigests?: readonly string[];
    externalUserId: string;
    externalUserIdCandidates?: readonly string[];
    now: Date;
  }): Promise<ChallengeVerifyResult>;
}

type ChallengeRow = {
  code_digest: string;
  attempts: number;
  max_attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
};

export class AuthPostgresRepository implements AuthRepositoryPort {
  async createChallenge(input: NewChallenge, policy: AuthPolicy): Promise<ChallengeCreateResult> {
    return withPostgresTransaction(async (client) => {
      const phoneHashes = [...new Set(input.phoneHashCandidates?.length ? input.phoneHashCandidates : [input.phoneHash])];
      const requestIpHashes = [...new Set(input.requestIpHashCandidates?.length ? input.requestIpHashCandidates : [input.requestIpHash])];
      for (const hash of [...phoneHashes].sort()) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [hash]);
      for (const hash of [...requestIpHashes].sort()) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 1))", [hash]);
      await this.cleanupExpired(client, policy);

      const limits = await client.query<{
        resend_blocked: boolean;
        phone_hour: string;
        phone_day: string;
        ip_hour: string;
      }>(`
        SELECT
          EXISTS (
            SELECT 1 FROM public.auth_verification_challenges
            WHERE phone_hash = ANY($1::char(64)[]) AND resend_after > NOW()
          ) AS resend_blocked,
          (SELECT count(*)::text FROM public.auth_verification_challenges
            WHERE phone_hash = ANY($1::char(64)[]) AND created_at > NOW() - INTERVAL '1 hour') AS phone_hour,
          (SELECT count(*)::text FROM public.auth_verification_challenges
            WHERE phone_hash = ANY($1::char(64)[]) AND created_at > NOW() - INTERVAL '24 hours') AS phone_day,
          (SELECT count(*)::text FROM public.auth_verification_challenges
            WHERE request_ip_hash = ANY($2::char(64)[]) AND created_at > NOW() - INTERVAL '1 hour') AS ip_hour
      `, [phoneHashes, requestIpHashes]);
      const row = limits.rows[0];
      if (
        row.resend_blocked
        || Number(row.phone_hour) >= policy.phoneHourlyLimit
        || Number(row.phone_day) >= policy.phoneDailyLimit
        || Number(row.ip_hour) >= policy.ipHourlyLimit
      ) return "rate_limited";

      await client.query(`
        INSERT INTO public.auth_verification_challenges (
          challenge_id, phone_hash, code_digest, purpose, expires_at,
          resend_after, attempts, max_attempts, request_ip_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
      `, [
        input.challengeId,
        input.phoneHash,
        input.codeDigest,
        input.purpose,
        input.expiresAt,
        input.resendAfter,
        policy.maxAttempts,
        input.requestIpHash,
      ]);
      return "created";
    });
  }

  async setProviderRequestId(challengeId: string, providerRequestId: string | null): Promise<void> {
    await withPostgresTransaction(async (client) => {
      await client.query(`
        UPDATE public.auth_verification_challenges
        SET provider_request_id = $2, updated_at = NOW()
        WHERE challenge_id = $1 AND consumed_at IS NULL
      `, [challengeId, providerRequestId]);
    });
  }

  async discardChallenge(challengeId: string): Promise<void> {
    await withPostgresTransaction(async (client) => {
      await client.query(
        "DELETE FROM public.auth_verification_challenges WHERE challenge_id = $1 AND consumed_at IS NULL",
        [challengeId]
      );
    });
  }

  async verifyAndConsume(input: {
    challengeId: string;
    phoneHash: string;
    phoneHashCandidates?: readonly string[];
    candidateDigest: string;
    candidateDigests?: readonly string[];
    externalUserId: string;
    externalUserIdCandidates?: readonly string[];
    now: Date;
  }): Promise<ChallengeVerifyResult> {
    return withPostgresTransaction(async (client) => {
      const phoneHashes = [...new Set(input.phoneHashCandidates?.length ? input.phoneHashCandidates : [input.phoneHash])];
      const candidateDigests = [...new Set(input.candidateDigests?.length ? input.candidateDigests : [input.candidateDigest])];
      const externalUserIds = [...new Set(input.externalUserIdCandidates?.length ? input.externalUserIdCandidates : [input.externalUserId])];
      const result = await client.query<ChallengeRow>(`
        SELECT code_digest, attempts, max_attempts, expires_at, consumed_at
        FROM public.auth_verification_challenges
        WHERE challenge_id = $1 AND phone_hash = ANY($2::char(64)[]) AND purpose = 'sign_in'
        FOR UPDATE
      `, [input.challengeId, phoneHashes]);
      const challenge = result.rows[0];
      if (
        !challenge
        || challenge.consumed_at
        || challenge.expires_at.getTime() <= input.now.getTime()
        || challenge.attempts >= challenge.max_attempts
      ) return { status: "invalid" };

      let digestMatches = false;
      for (const candidate of candidateDigests) {
        const matches = verificationDigestsEqual(challenge.code_digest, candidate);
        digestMatches = digestMatches || matches;
      }
      if (!digestMatches) {
        await client.query(`
          UPDATE public.auth_verification_challenges
          SET attempts = LEAST(attempts + 1, max_attempts), updated_at = $2
          WHERE challenge_id = $1
        `, [input.challengeId, input.now]);
        return { status: "invalid" };
      }

      const consumed = await client.query(`
        UPDATE public.auth_verification_challenges
        SET consumed_at = $2, updated_at = $2
        WHERE challenge_id = $1
          AND consumed_at IS NULL
          AND attempts < max_attempts
          AND expires_at > $2
        RETURNING challenge_id
      `, [input.challengeId, input.now]);
      if (consumed.rowCount !== 1) return { status: "invalid" };

      const matchedUsers = await client.query<{
        id: string;
        external_id: string;
        created_at: Date;
      }>(`SELECT id, external_id, created_at FROM public.users WHERE external_id = ANY($1::text[]) FOR UPDATE`, [externalUserIds]);
      if (matchedUsers.rows.length > 1) throw new Error("AUTH_IDENTITY_PEPPER_COLLISION");
      const currentExternalUserId = input.externalUserId;
      const user = matchedUsers.rows[0]
        ? await client.query<{ id: string; external_id: string; created_at: Date }>(
          `UPDATE public.users SET external_id=$2, updated_at=NOW() WHERE id=$1::uuid RETURNING id, external_id, created_at`,
          [matchedUsers.rows[0].id, currentExternalUserId],
        )
        : await client.query<{ id: string; external_id: string; created_at: Date }>(
          `INSERT INTO public.users (external_id, profile) VALUES ($1, '{}'::jsonb) RETURNING id, external_id, created_at`,
          [currentExternalUserId],
        );
      await client.query(
        `INSERT INTO public.business_funnel_events (user_id, event_type, event_key)
         VALUES ($1, 'login_completed', $2)
         ON CONFLICT (event_type, event_key) DO NOTHING`,
        [user.rows[0].id, `login_completed:${user.rows[0].id}`],
      );
      return {
        status: "verified",
        user: {
          id: user.rows[0].id,
          externalUserId: user.rows[0].external_id,
          createdAt: user.rows[0].created_at.toISOString(),
        },
      };
    });
  }

  private async cleanupExpired(client: PoolClient, policy: AuthPolicy): Promise<void> {
    await client.query(`
      DELETE FROM public.auth_verification_challenges
      WHERE challenge_id IN (
        SELECT challenge_id
        FROM public.auth_verification_challenges
        WHERE expires_at < NOW() - ($1 * INTERVAL '1 day')
        ORDER BY expires_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
    `, [policy.cleanupRetentionDays, policy.cleanupBatchSize]);
  }
}
