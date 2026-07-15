import type { NextRequest } from "next/server";

/**
 * AUTH_MIGRATION_REQUIRED
 *
 * This query parameter is a temporary compatibility boundary, not
 * authentication. Replace it with the formal session identity
 * before treating ownership checks as an authorization control.
 */
export function temporaryExternalUserId(req: NextRequest): string | null {
  return req.nextUrl.searchParams.get("userId")?.trim() || null;
}

export function temporaryExternalUserIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const userId = (body as Record<string, unknown>).userId;
  return typeof userId === "string" ? userId.trim() || null : null;
}
