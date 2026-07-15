export type OriginCheckResult =
  | { allowed: true }
  | { allowed: false; code: "AUTH_ALLOWED_ORIGIN_NOT_CONFIGURED" | "AUTH_ALLOWED_ORIGIN_INVALID" | "ORIGIN_NOT_ALLOWED" };

export function checkAllowedOrigin(
  request: Request,
  configuredOrigin = process.env.AUTH_ALLOWED_ORIGIN,
): OriginCheckResult {
  const allowed = configuredOrigin?.trim();
  if (!allowed) return { allowed: false, code: "AUTH_ALLOWED_ORIGIN_NOT_CONFIGURED" };

  let normalizedAllowed: string;
  try {
    normalizedAllowed = new URL(allowed).origin;
  } catch {
    return { allowed: false, code: "AUTH_ALLOWED_ORIGIN_INVALID" };
  }

  const origin = request.headers.get("origin");
  return origin === normalizedAllowed
    ? { allowed: true }
    : { allowed: false, code: "ORIGIN_NOT_ALLOWED" };
}
