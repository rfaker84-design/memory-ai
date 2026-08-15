import { createHmac, timingSafeEqual } from "node:crypto";

import { queryPostgres } from "@/src/server/database";

export type PendingVideoReviewArtifact = {
  /** Internal-only. Never include this in an API response or a signed token. */
  artifactKey: string;
  jobId: string;
};

export type VideoReviewPreviewQueryPort = {
  findPendingForReview(input: { jobId: string }): Promise<PendingVideoReviewArtifact | null>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_REVIEW_PREVIEW_TTL_SECONDS = 60;

type Claims = {
  version: 1;
  jobId: string;
  artifactBinding: string;
  expiresAt: number;
};

type VerifiedClaims = Claims & { signingSecretIndex: number };

export class VideoReviewPreviewError extends Error {
  constructor(readonly code: "VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE" | "VIDEO_REVIEW_PREVIEW_UNAVAILABLE") {
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
      || typeof claims.jobId !== "string"
      || !UUID_PATTERN.test(claims.jobId)
      || typeof claims.artifactBinding !== "string"
      || !/^[A-Za-z0-9_-]{43}$/.test(claims.artifactBinding)
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
 * A short-lived bearer token issued only after the existing reviewer credential
 * has authorized the exact pending job. It contains no storage key and is
 * checked against the live pending-review state for every media range read.
 */
export class FirstPresenceReviewPreviewSigner {
  private readonly secrets: readonly string[];

  constructor(secret: string, previousSecret?: string | null) {
    if (Buffer.byteLength(secret, "utf8") < 32 || (previousSecret && Buffer.byteLength(previousSecret, "utf8") < 32)) {
      throw new VideoReviewPreviewError("VIDEO_REVIEW_PREVIEW_UNAVAILABLE");
    }
    this.secrets = Object.freeze([secret, ...(previousSecret ? [previousSecret] : [])]);
  }

  issue(input: { artifact: PendingVideoReviewArtifact; now?: Date; ttlSeconds?: number }): { token: string; expiresAt: string } {
    const ttlSeconds = Math.min(
      Math.max(1, Math.floor(input.ttlSeconds ?? MAX_REVIEW_PREVIEW_TTL_SECONDS)),
      MAX_REVIEW_PREVIEW_TTL_SECONDS,
    );
    const expiresAt = Math.floor((input.now ?? new Date()).getTime() / 1000) + ttlSeconds;
    const payload = encode({
      version: 1,
      jobId: input.artifact.jobId,
      artifactBinding: this.binding(input.artifact.artifactKey),
      expiresAt,
    });
    const signature = createHmac("sha256", this.secrets[0]).update(payload, "utf8").digest("base64url");
    return { token: `${payload}.${signature}`, expiresAt: new Date(expiresAt * 1000).toISOString() };
  }

  verify(token: string, now: Date = new Date()): VerifiedClaims | null {
    if (!TOKEN_PATTERN.test(token)) return null;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const claims = decode(payload);
    if (!claims || claims.expiresAt <= Math.floor(now.getTime() / 1000)) return null;
    for (const [signingSecretIndex, secret] of this.secrets.entries()) {
      const expected = createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
      if (safeEqual(signature, expected)) return { ...claims, signingSecretIndex };
    }
    return null;
  }

  assertMatchesArtifact(claims: VerifiedClaims, artifact: PendingVideoReviewArtifact): boolean {
    const secret = this.secrets[claims.signingSecretIndex];
    return Boolean(secret)
      && claims.jobId === artifact.jobId
      && safeEqual(claims.artifactBinding, this.binding(artifact.artifactKey, secret!));
  }

  private binding(value: string, secret = this.secrets[0]): string {
    return createHmac("sha256", secret).update(`review-preview:${value}`, "utf8").digest("base64url");
  }
}

/** This query deliberately has no owner-facing variant: only reviewer routes use it. */
export class FirstPresenceVideoReviewPreviewQuery implements VideoReviewPreviewQueryPort {
  async findPendingForReview(input: { jobId: string }): Promise<PendingVideoReviewArtifact | null> {
    if (!UUID_PATTERN.test(input.jobId)) return null;
    const result = await queryPostgres<{ id: string; artifact_key: string }>(
      `SELECT j.id, j.artifact_key
       FROM public.video_generation_jobs j
       WHERE j.id = $1
         AND j.status = 'manual_review_required'
         AND j.quality_status = 'pending'
         AND j.artifact_key IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public.video_generation_quality_reviews r
           WHERE r.job_id = j.id
             AND r.review_key = ('media.' || j.id::text)
             AND r.reviewer_kind = 'system'
             AND r.decision = 'pending'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM public.video_generation_quality_reviews r
           WHERE r.job_id = j.id
             AND r.reviewer_kind = 'manual'
         )`,
      [input.jobId],
    );
    const row = result.rows[0];
    return row ? { jobId: row.id, artifactKey: row.artifact_key } : null;
  }
}

export function assertReviewPreviewArtifact(input: {
  signer: FirstPresenceReviewPreviewSigner;
  token: string;
  artifact: PendingVideoReviewArtifact | null;
  now?: Date;
}): PendingVideoReviewArtifact {
  const claims = input.signer.verify(input.token, input.now);
  if (!claims || !input.artifact || !input.signer.assertMatchesArtifact(claims, input.artifact)) {
    throw new VideoReviewPreviewError("VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE");
  }
  return input.artifact;
}
