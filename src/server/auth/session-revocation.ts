import { queryPostgres } from "../database";

export async function isSessionRevoked(input: { jti: string; userId: string }): Promise<boolean> {
  const result = await queryPostgres<{ revoked: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.auth_session_revocations
       WHERE jti = $1::uuid AND user_id = $2::uuid AND expires_at > NOW()
     ) AS revoked`,
    [input.jti, input.userId],
  );
  return result.rows[0]?.revoked === true;
}
