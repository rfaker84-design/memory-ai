import type { NextRequest } from "next/server";

import { queryPostgres } from "@/src/server/database";
import { isStagingRuntime } from "@/src/server/runtime/staging-contract";

import type { AuthSession } from "./session";

export const STAGING_VISUAL_REVIEW_HEADER = "x-memoryai-staging-visual-review";
export const STAGING_VISUAL_REVIEW_HOST = "app.staging.yijianmemory.cn";
export const STAGING_VISUAL_REPAIR_HEADER = "x-memoryai-staging-visual-repair";

const REVIEW_TTL_SECONDS = 30 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StagingOwnerReadOnlyReviewSubject = Readonly<{
  userId: string;
  externalUserId: string;
  memoryId: string;
  expiresAt: string;
}>;

export type StagingApprovedIdleArtifact = Readonly<{
  jobId: string;
  artifactKey: string;
}>;

type ReviewWindow = Readonly<{ memoryId: string; expiresAt: Date }>;

function boundedStagingOwnerWindow(
  expiryVariable: "STAGING_VISUAL_REVIEW_EXPIRES_AT" | "STAGING_OWNER_VISUAL_REPAIR_EXPIRES_AT",
  environment: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): ReviewWindow | null {
  if (!isStagingRuntime(environment)) return null;
  const memoryId = environment.STAGING_OWNER_READONLY_REVIEW_MEMORY_ID?.trim();
  const rawExpiry = environment[expiryVariable]?.trim();
  if (!memoryId || !UUID_PATTERN.test(memoryId) || !rawExpiry) return null;
  const expiresAt = new Date(rawExpiry);
  const remainingMilliseconds = expiresAt.getTime() - now.getTime();
  if (!Number.isFinite(expiresAt.getTime()) || remainingMilliseconds < 1 || remainingMilliseconds > REVIEW_TTL_SECONDS * 1000) return null;
  return { memoryId, expiresAt };
}

/** The expiry is absolute, bounded to thirty minutes, and never rolls forward. */
export function stagingOwnerReadOnlyReviewWindow(
  environment: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): ReviewWindow | null {
  return boundedStagingOwnerWindow("STAGING_VISUAL_REVIEW_EXPIRES_AT", environment, now);
}

/** A separate, bounded Staging regression window for the one live chat check. */
export function stagingOwnerVisualRepairWindow(
  environment: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): ReviewWindow | null {
  return boundedStagingOwnerWindow("STAGING_OWNER_VISUAL_REPAIR_EXPIRES_AT", environment, now);
}

/**
 * This marker is installed by the Staging Nginx proxy after it overwrites any
 * caller-supplied value. It is never a browser credential: method, host,
 * Staging runtime, and the bounded review window are all required here.
 */
export function isDirectStagingOwnerReadOnlyReviewRequest(request: NextRequest): boolean {
  return ["GET", "HEAD"].includes(request.method)
    && (request.headers.get("host") ?? request.nextUrl.host) === STAGING_VISUAL_REVIEW_HOST
    && request.headers.get(STAGING_VISUAL_REVIEW_HEADER) === "1"
    && stagingOwnerReadOnlyReviewWindow() !== null;
}

export function isDirectStagingOwnerVisualRepairRequest(request: NextRequest): boolean {
  return (request.headers.get("host") ?? request.nextUrl.host) === STAGING_VISUAL_REVIEW_HOST
    && request.headers.get(STAGING_VISUAL_REPAIR_HEADER) === "1"
    && stagingOwnerVisualRepairWindow() !== null;
}

async function resolveStagingOwnerReadOnlyReviewSubjectForWindow(
  window: ReviewWindow | null,
): Promise<StagingOwnerReadOnlyReviewSubject | null> {
  if (!window) return null;
  const result = await queryPostgres<{ userId: string; externalUserId: string }>(
    `SELECT u.id AS "userId", u.external_id AS "externalUserId"
       FROM public.memories m
       INNER JOIN public.users u ON u.id = m.user_id
      WHERE m.id = $1::uuid
        AND m.deleted_at IS NULL`,
    [window.memoryId],
  );
  const subject = result.rows[0];
  return subject ? {
    ...subject,
    memoryId: window.memoryId,
    expiresAt: window.expiresAt.toISOString(),
  } : null;
}

export async function resolveStagingOwnerReadOnlyReviewSubject(): Promise<StagingOwnerReadOnlyReviewSubject | null> {
  return resolveStagingOwnerReadOnlyReviewSubjectForWindow(stagingOwnerReadOnlyReviewWindow());
}

export async function resolveDirectStagingOwnerReadOnlyReviewSession(request: NextRequest): Promise<AuthSession | null> {
  if (!isDirectStagingOwnerReadOnlyReviewRequest(request)) return null;
  const subject = await resolveStagingOwnerReadOnlyReviewSubject();
  return subject ? {
    userId: subject.userId,
    externalUserId: subject.externalUserId,
    readOnlyReview: true,
    expiresAt: subject.expiresAt,
  } : null;
}

/**
 * The repair identity is server-injected, has an absolute thirty-minute
 * expiry, and is narrowed in middleware to the one normal chat mutation used
 * by this Staging regression. It is never a browser token or a general Owner
 * session.
 */
export async function resolveDirectStagingOwnerVisualRepairSession(request: NextRequest): Promise<AuthSession | null> {
  if (!isDirectStagingOwnerVisualRepairRequest(request)) return null;
  const subject = await resolveStagingOwnerReadOnlyReviewSubjectForWindow(stagingOwnerVisualRepairWindow());
  return subject ? {
    userId: subject.userId,
    externalUserId: subject.externalUserId,
    stagingVisualRepair: true,
    expiresAt: subject.expiresAt,
  } : null;
}

/** A signed legacy review session is also constrained to the configured owner and Memory. */
export async function resolveStagingOwnerReadOnlyReviewForSession(
  session: AuthSession | null,
): Promise<StagingOwnerReadOnlyReviewSubject | null> {
  if (!session || (!session.readOnlyReview && !session.stagingVisualRepair)) return null;
  const subject = await resolveStagingOwnerReadOnlyReviewSubjectForWindow(
    session.stagingVisualRepair ? stagingOwnerVisualRepairWindow() : stagingOwnerReadOnlyReviewWindow(),
  );
  return subject && subject.userId === session.userId && subject.externalUserId === session.externalUserId
    ? subject
    : null;
}

/** No fallback is permitted: only an existing approved idle artifact is visible. */
export async function findStagingOwnerReadOnlyApprovedIdle(input: {
  userId: string;
  memoryId: string;
  jobId?: string;
}): Promise<StagingApprovedIdleArtifact | null> {
  const result = await queryPostgres<StagingApprovedIdleArtifact>(
    `SELECT j.id AS "jobId", j.artifact_key AS "artifactKey"
       FROM public.video_generation_jobs j
      WHERE j.user_id = $1::uuid
        AND j.memory_id = $2::uuid
        AND j.use_case = 'companion_micro_motion'
        AND j.motion_variant = 'idle'
        AND j.status = 'succeeded'
        AND j.quality_status = 'approved'
        AND j.artifact_key IS NOT NULL
        AND ($3::uuid IS NULL OR j.id = $3::uuid)
      ORDER BY j.pack_version DESC, j.created_at DESC, j.id DESC
      LIMIT 1`,
    [input.userId, input.memoryId, input.jobId ?? null],
  );
  return result.rows[0] ?? null;
}
