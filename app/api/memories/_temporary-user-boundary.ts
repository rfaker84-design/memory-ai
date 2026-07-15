import type { NextRequest } from "next/server";

/**
 * AUTH_MIGRATION_REQUIRED
 *
 * This query parameter is a temporary compatibility boundary, not
 * authentication. Replace it with the formal non-Supabase session identity
 * before treating ownership checks as an authorization control.
 */
export function temporaryExternalUserId(req: NextRequest): string | null {
  return req.nextUrl.searchParams.get("userId")?.trim() || null;
}
