import { queryPostgres } from "../database";

export async function isSessionRevoked(input: { jti: string; userId: string; issuedAt: string }): Promise<boolean> {
  const result = await queryPostgres<{ revoked: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.auth_session_revocations
       WHERE jti = $1::uuid AND user_id = $2::uuid AND expires_at > NOW()
       UNION ALL
       SELECT 1 FROM public.auth_session_invalidations
       WHERE user_id = $2::uuid AND invalid_before >= $3::timestamptz
     ) AS revoked`,
    [input.jti, input.userId, input.issuedAt],
  );
  return result.rows[0]?.revoked === true;
}
