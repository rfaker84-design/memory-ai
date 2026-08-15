import { createHmac, timingSafeEqual } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export const REVIEWER_BROWSER_SESSION_COOKIE = "__Host-memoryai-video-review";
export const REVIEWER_BROWSER_SESSION_TTL_SECONDS = 8 * 60 * 60;
/**
 * This grants access only to an exact, still-pending review page. It is not a
 * media token: the page re-checks review state and mints its 60-second media
 * tokens separately. Matching the browser session avoids reviewers receiving
 * a stale link before they can open the stable page.
 */
export const REVIEWER_BROWSER_BOOTSTRAP_TTL_SECONDS = REVIEWER_BROWSER_SESSION_TTL_SECONDS;

type Scope = "bootstrap" | "session";

type Claims = {
  version: 1;
  scope: Scope;
  jobId: string;
  expiresAt: number;
};

type VerifiedClaims = Claims & { signingSecretIndex: number };

export class ReviewerBrowserPreviewError extends Error {
  constructor(readonly code: "REVIEWER_BROWSER_PREVIEW_UNAVAILABLE") {
    super(code);
  }
}

function encode(value: Claims): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(value: string): Claims | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const claims = parsed as Record<string, unknown>;
    if (
      claims.version !== 1
      || (claims.scope !== "bootstrap" && claims.scope !== "session")
      || typeof claims.jobId !== "string"
      || !UUID_PATTERN.test(claims.jobId)
      || typeof claims.expiresAt !== "number"
      || !Number.isSafeInteger(claims.expiresAt)
    ) return null;
    return claims as Claims;
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

/**
 * A reviewer-header-authenticated bootstrap mints a browser-only, exact-job
 * HttpOnly session. The page itself has no bearer media URL and all media
 * reads still re-check the live pending-review record.
 */
export class FirstPresenceReviewerBrowserSessionSigner {
  private readonly secrets: readonly string[];

  constructor(secret: string, previousSecret?: string | null) {
    if (Buffer.byteLength(secret, "utf8") < 32 || (previousSecret && Buffer.byteLength(previousSecret, "utf8") < 32)) {
      throw new ReviewerBrowserPreviewError("REVIEWER_BROWSER_PREVIEW_UNAVAILABLE");
    }
    this.secrets = Object.freeze([secret, ...(previousSecret ? [previousSecret] : [])]);
  }

  issue(input: { jobId: string; scope: Scope; now?: Date; ttlSeconds?: number }): { token: string; expiresAt: string } {
    if (!UUID_PATTERN.test(input.jobId)) throw new ReviewerBrowserPreviewError("REVIEWER_BROWSER_PREVIEW_UNAVAILABLE");
    const maximum = input.scope === "bootstrap"
      ? REVIEWER_BROWSER_BOOTSTRAP_TTL_SECONDS
      : REVIEWER_BROWSER_SESSION_TTL_SECONDS;
    const ttlSeconds = Math.min(Math.max(1, Math.floor(input.ttlSeconds ?? maximum)), maximum);
    const expiresAt = Math.floor((input.now ?? new Date()).getTime() / 1000) + ttlSeconds;
    const payload = encode({ version: 1, scope: input.scope, jobId: input.jobId, expiresAt });
    const signature = createHmac("sha256", this.secrets[0]).update(payload, "utf8").digest("base64url");
    return { token: `${payload}.${signature}`, expiresAt: new Date(expiresAt * 1000).toISOString() };
  }

  verify(input: { token: string | undefined; scope: Scope; jobId?: string; now?: Date }): VerifiedClaims | null {
    if (!input.token || !TOKEN_PATTERN.test(input.token)) return null;
    const [payload, signature, extra] = input.token.split(".");
    if (!payload || !signature || extra) return null;
    const claims = decode(payload);
    if (
      !claims
      || claims.scope !== input.scope
      || (input.jobId !== undefined && claims.jobId !== input.jobId)
      || claims.expiresAt <= Math.floor((input.now ?? new Date()).getTime() / 1000)
    ) return null;
    for (const [signingSecretIndex, secret] of this.secrets.entries()) {
      const expected = createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
      if (safeEqual(signature, expected)) return { ...claims, signingSecretIndex };
    }
    return null;
  }
}

export function reviewerBrowserPreviewAvailable(environment: Record<string, string | undefined> = process.env): boolean {
  return environment.NODE_ENV === "production" && environment.DEPLOYMENT_ENV === "staging";
}
