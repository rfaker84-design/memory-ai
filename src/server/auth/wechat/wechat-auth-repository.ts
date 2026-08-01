import type { PoolClient } from "pg";

import { withPostgresTransaction } from "@/src/server/database/postgres";

import type { AuthUser } from "../auth-repository";

export type CreateWeChatStateResult = "created" | "collision";
export type ResolveWeChatIdentityResult =
  | { status: "resolved"; user: AuthUser }
  | { status: "account_deletion_pending" }
  | { status: "conflict" };

export interface WeChatAuthRepositoryPort {
  createState(input: {
    stateDigest: string;
    expiresAt: Date;
  }): Promise<CreateWeChatStateResult>;
  consumeState(input: {
    stateDigest: string;
    now: Date;
  }): Promise<boolean>;
  resolveIdentity(input: {
    primarySubjectHash: string;
    fallbackSubjectHash: string | null;
  }): Promise<ResolveWeChatIdentityResult>;
}

type UserRow = {
  id: string;
  external_id: string;
  created_at: Date;
};

type IdentityUserRow = UserRow & {
  subject_hash: string;
};

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    externalUserId: row.external_id,
    createdAt: row.created_at.toISOString(),
  };
}

export class WeChatAuthPostgresRepository implements WeChatAuthRepositoryPort {
  async createState(input: {
    stateDigest: string;
    expiresAt: Date;
  }): Promise<CreateWeChatStateResult> {
    return withPostgresTransaction(async (client) => {
      await client.query(`
        DELETE FROM public.auth_oauth_states
        WHERE state_digest IN (
          SELECT state_digest
          FROM public.auth_oauth_states
          WHERE expires_at < NOW() - INTERVAL '1 day'
          ORDER BY expires_at ASC
          LIMIT 200
          FOR UPDATE SKIP LOCKED
        )
      `);
      const inserted = await client.query(`
        INSERT INTO public.auth_oauth_states (
          state_digest, provider, expires_at
        )
        VALUES ($1, 'wechat', $2)
        ON CONFLICT (state_digest) DO NOTHING
      `, [input.stateDigest, input.expiresAt]);
      return inserted.rowCount === 1 ? "created" : "collision";
    });
  }

  async consumeState(input: {
    stateDigest: string;
    now: Date;
  }): Promise<boolean> {
    return withPostgresTransaction(async (client) => {
      const consumed = await client.query(`
        UPDATE public.auth_oauth_states
        SET consumed_at = $2
        WHERE state_digest = $1
          AND provider = 'wechat'
          AND link_user_id IS NULL
          AND consumed_at IS NULL
          AND expires_at > $2
        RETURNING state_digest
      `, [input.stateDigest, input.now]);
      return consumed.rowCount === 1;
    });
  }

  async resolveIdentity(input: {
    primarySubjectHash: string;
    fallbackSubjectHash: string | null;
  }): Promise<ResolveWeChatIdentityResult> {
    return withPostgresTransaction(async (client) => {
      const subjectHashes = [
        input.primarySubjectHash,
        ...(input.fallbackSubjectHash ? [input.fallbackSubjectHash] : []),
      ].sort();
      for (const subjectHash of subjectHashes) {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [subjectHash],
        );
      }

      const existing = await client.query<IdentityUserRow>(`
        SELECT i.subject_hash, u.id, u.external_id, u.created_at
        FROM public.auth_external_identities i
        JOIN public.users u ON u.id = i.user_id
        WHERE i.provider = 'wechat'
          AND i.subject_hash::text = ANY($1::text[])
        FOR UPDATE OF i, u
      `, [subjectHashes]);
      const byHash = new Map(
        existing.rows.map((row) => [row.subject_hash.trim(), row]),
      );
      const primary = byHash.get(input.primarySubjectHash);
      const fallback = input.fallbackSubjectHash
        ? byHash.get(input.fallbackSubjectHash)
        : undefined;
      if (primary) {
        if (fallback && fallback.id !== primary.id) return { status: "conflict" };
        if (process.env.ACCOUNT_DELETION_ENABLED === "true") {
          const deletion = await client.query(
            `SELECT 1 FROM public.account_deletion_requests
             WHERE user_id=$1::uuid AND status <> 'failed' FOR KEY SHARE`,
            [primary.id],
          );
          if (deletion.rowCount !== 0) return { status: "account_deletion_pending" };
        }
        await this.recordLogin(client, primary.id);
        return { status: "resolved", user: mapUser(primary) };
      }
      // A prior OpenID-only account must never be silently upgraded or merged
      // when WeChat later supplies a UnionID.
      if (fallback) return { status: "conflict" };

      const externalUserId = `wechat:${input.primarySubjectHash}`;
      const created = await client.query<UserRow>(`
        INSERT INTO public.users (external_id, profile)
        VALUES ($1, '{}'::jsonb)
        ON CONFLICT (external_id) DO UPDATE SET updated_at = NOW()
        RETURNING id, external_id, created_at
      `, [externalUserId]);
      await client.query(`
        INSERT INTO public.auth_external_identities (
          provider, subject_hash, user_id
        ) VALUES ('wechat', $1, $2)
      `, [input.primarySubjectHash, created.rows[0].id]);
      await this.recordLogin(client, created.rows[0].id);
      return { status: "resolved", user: mapUser(created.rows[0]) };
    });
  }

  private async recordLogin(
    client: PoolClient,
    userId: string,
  ): Promise<void> {
    await client.query(`
      INSERT INTO public.business_funnel_events (user_id, event_type, event_key)
      VALUES ($1, 'login_completed', $2)
      ON CONFLICT (event_type, event_key) DO NOTHING
    `, [userId, `login_completed:${userId}`]);
  }
}
