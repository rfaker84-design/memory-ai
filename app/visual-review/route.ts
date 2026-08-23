import { NextRequest, NextResponse } from "next/server";

import { issueSession, setSessionCookie, verifyRequestSession } from "@/src/server/auth";
import { queryPostgres } from "@/src/server/database";
import {
  aiGeneratedPlaybackHeaders,
  createVideoArtifactStorageFromEnvironment,
  FirstPresencePlaybackSigner,
  getVideoArtifactRuntimeConfiguration,
  parseSingleRange,
} from "@/features/video";
import { isStagingRuntime } from "@/src/server/runtime/staging-contract";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const REVIEW_HEADER = "x-memoryai-staging-visual-review";
const STAGING_APP_HOST = "app.staging.yijianmemory.cn";
const REVIEW_COMPANION_MOTION_QUERY = "reviewCompanionMotion";
const REVIEW_COMPANION_PLAYBACK_QUERY = "reviewCompanionPlayback";
const REVIEW_COMPANION_MEDIA_QUERY = "reviewCompanionMedia";
const PLAYBACK_TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const REVIEW_TTL_SECONDS = 30 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type OwnerSubject = Readonly<{ id: string; external_id: string }>;
type ApprovedIdleSlot = Readonly<{
  jobId: string;
  variant: "idle";
  status: "succeeded";
  artifactAvailable: true;
}>;
type ApprovedIdleArtifact = Readonly<{
  jobId: string;
  artifactKey: string;
}>;

function unavailable(): NextResponse {
  return applyAuthNoStore(new NextResponse(null, { status: 404 }));
}

function reviewWindow(): { memoryId: string; expiresAt: Date } | null {
  const memoryId = process.env.STAGING_OWNER_READONLY_REVIEW_MEMORY_ID?.trim();
  const rawExpiry = process.env.STAGING_VISUAL_REVIEW_EXPIRES_AT?.trim();
  if (!memoryId || !UUID_PATTERN.test(memoryId) || !rawExpiry) return null;
  const expiresAt = new Date(rawExpiry);
  const remainingMilliseconds = expiresAt.getTime() - Date.now();
  // The operator supplies one absolute expiry. It must never create a rolling
  // window or silently extend beyond the requested 30-minute review period.
  if (!Number.isFinite(expiresAt.getTime()) || remainingMilliseconds < 1 || remainingMilliseconds > REVIEW_TTL_SECONDS * 1000) return null;
  return { memoryId, expiresAt };
}

async function ownerSubject(memoryId: string): Promise<OwnerSubject | null> {
  const result = await queryPostgres<OwnerSubject>(
    `SELECT u.id, u.external_id
       FROM public.memories m
       INNER JOIN public.users u ON u.id = m.user_id
      WHERE m.id = $1::uuid
        AND m.deleted_at IS NULL`,
    [memoryId],
  );
  return result.rows[0] ?? null;
}

async function approvedIdleArtifact(input: { userId: string; memoryId: string; jobId?: string }): Promise<ApprovedIdleArtifact | null> {
  const result = await queryPostgres<ApprovedIdleArtifact>(
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

async function readOnlyReviewSubject(request: NextRequest): Promise<{ subject: OwnerSubject; memoryId: string } | null> {
  const window = reviewWindow();
  if (!window) return null;
  const session = await verifyRequestSession(request);
  if (!session?.readOnlyReview) return null;
  const subject = await ownerSubject(window.memoryId);
  return subject && subject.id === session.userId ? { subject, memoryId: window.memoryId } : null;
}

async function readOnlyCompanionMotion(request: NextRequest): Promise<NextResponse> {
  if ([...request.nextUrl.searchParams.keys()].join(",") !== REVIEW_COMPANION_MOTION_QUERY) return unavailable();
  const review = await readOnlyReviewSubject(request);
  if (!review) return unavailable();
  const idle = await approvedIdleArtifact({ userId: review.subject.id, memoryId: review.memoryId });
  // No fallback is allowed: only an existing, approved idle artifact can be returned.
  if (!idle) return unavailable();
  const slot: ApprovedIdleSlot = {
    jobId: idle.jobId,
    variant: "idle",
    status: "succeeded",
    artifactAvailable: true,
  };
  return applyAuthNoStore(NextResponse.json({ eligible: true, slots: [slot] }));
}

async function readOnlyCompanionPlayback(request: NextRequest): Promise<NextResponse> {
  const jobId = request.nextUrl.searchParams.get(REVIEW_COMPANION_PLAYBACK_QUERY);
  if (
    [...request.nextUrl.searchParams.keys()].join(",") !== REVIEW_COMPANION_PLAYBACK_QUERY
    || !jobId
    || !UUID_PATTERN.test(jobId)
  ) return unavailable();
  const review = await readOnlyReviewSubject(request);
  if (!review) return unavailable();
  const idle = await approvedIdleArtifact({ userId: review.subject.id, memoryId: review.memoryId, jobId });
  // The opaque token binds the exact approved artifact without disclosing its key.
  if (!idle) return unavailable();
  const configuration = getVideoArtifactRuntimeConfiguration();
  const signer = new FirstPresencePlaybackSigner(configuration.signingSecret, configuration.previousSigningSecret);
  const signed = signer.issue({
    artifact: {
      jobId: idle.jobId,
      memoryId: review.memoryId,
      artifactKey: idle.artifactKey,
      playbackUrl: "",
      playbackExpiresAt: "",
      presentation: "additional_generation",
      saveAllowed: false,
      motionVariant: "idle",
    },
    externalUserId: review.subject.external_id,
    ttlSeconds: 300,
  });
  return applyAuthNoStore(NextResponse.json({
    playback: {
      url: `/api/first-presence-video/playback/${signed.token}`,
      expiresAt: signed.expiresAt,
    },
  }));
}

function requestedRendition(request: NextRequest): "mobile" | null | "invalid" {
  const entries = [...request.nextUrl.searchParams.entries()];
  if (entries.length !== 1 || entries[0]?.[0] !== REVIEW_COMPANION_MEDIA_QUERY) return "invalid";
  return entries[0][1] ? null : "invalid";
}

async function readOnlyCompanionMedia(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get(REVIEW_COMPANION_MEDIA_QUERY);
  const rendition = request.headers.get("x-memoryai-review-rendition") === "mobile" ? "mobile" : null;
  if (!token || !PLAYBACK_TOKEN_PATTERN.test(token) || requestedRendition(request) === "invalid") return unavailable();
  const review = await readOnlyReviewSubject(request);
  if (!review) return unavailable();
  const configuration = getVideoArtifactRuntimeConfiguration();
  const signer = new FirstPresencePlaybackSigner(configuration.signingSecret, configuration.previousSigningSecret);
  const claims = signer.verify(token);
  if (!claims || claims.memoryId !== review.memoryId) return unavailable();
  const idle = await approvedIdleArtifact({ userId: review.subject.id, memoryId: review.memoryId, jobId: claims.jobId });
  if (!idle || !signer.assertMatchesArtifact(claims, {
    jobId: idle.jobId,
    memoryId: review.memoryId,
    artifactKey: idle.artifactKey,
    playbackUrl: "",
    playbackExpiresAt: "",
    presentation: "additional_generation",
    saveAllowed: false,
    motionVariant: "idle",
  }, review.subject.external_id)) return unavailable();
  const storage = createVideoArtifactStorageFromEnvironment();
  const firstByte = await storage.readArtifactRange({ artifactKey: idle.artifactKey, start: 0, end: 0, ...(rendition ? { rendition } : {}) });
  const range = parseSingleRange(request.headers.get("range"), firstByte.totalBytes);
  if (range === "invalid") return applyAuthNoStore(new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${firstByte.totalBytes}`, "Accept-Ranges": "bytes" } }));
  const body = range && (range.start !== 0 || range.end !== 0)
    ? await storage.readArtifactRange({ artifactKey: idle.artifactKey, ...range, ...(rendition ? { rendition } : {}) })
    : range ? firstByte : await storage.readArtifactRange({ artifactKey: idle.artifactKey, ...(rendition ? { rendition } : {}) });
  const selectedRange = range ?? { start: 0, end: body.totalBytes - 1 };
  if (body.totalBytes !== firstByte.totalBytes || body.body.byteLength !== selectedRange.end - selectedRange.start + 1) return unavailable();
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": "video/mp4",
    "Content-Disposition": "inline; filename=first-presence.mp4",
    "Content-Length": String(body.body.byteLength),
    "X-Content-Type-Options": "nosniff",
  });
  for (const [name, value] of Object.entries(aiGeneratedPlaybackHeaders(idle.jobId))) headers.set(name, value);
  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${body.totalBytes}`);
  const responseBody = new Uint8Array(body.body.byteLength);
  responseBody.set(body.body);
  return applyAuthNoStore(new NextResponse(responseBody, { status: range ? 206 : 200, headers }));
}

/**
 * A Staging-only, Nginx-origin-bound bootstrap endpoint. Its response contains
 * no identity or credential material; it only installs the formal host-only
 * session cookie and sends the reviewer to the existing product experience.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (
    !isStagingRuntime()
    // The Standalone server resolves nextUrl from its loopback listener. Nginx
    // forwards its normalized public $host, which is the authoritative origin
    // contract for this Nginx-injected, source-bound bridge.
    || request.headers.get("host") !== STAGING_APP_HOST
    || request.headers.get(REVIEW_HEADER) !== "1"
  ) return unavailable();

  if (
    request.nextUrl.searchParams.has(REVIEW_COMPANION_MOTION_QUERY)
    || request.nextUrl.searchParams.has(REVIEW_COMPANION_PLAYBACK_QUERY)
    || request.nextUrl.searchParams.has(REVIEW_COMPANION_MEDIA_QUERY)
  ) {
    try {
      return request.nextUrl.searchParams.has(REVIEW_COMPANION_MOTION_QUERY)
        ? await readOnlyCompanionMotion(request)
        : request.nextUrl.searchParams.has(REVIEW_COMPANION_PLAYBACK_QUERY)
          ? await readOnlyCompanionPlayback(request)
          : await readOnlyCompanionMedia(request);
    } catch {
      return unavailable();
    }
  }
  if ([...request.nextUrl.searchParams.keys()].length > 0) return unavailable();

  const window = reviewWindow();
  if (!window) return unavailable();

  try {
    // Owner identity is resolved only server-side from the configured target
    // Memory. Neither the Memory nor Owner identifier is returned or logged.
    const subject = await ownerSubject(window.memoryId);
    if (!subject) return unavailable();

    const ttlSeconds = Math.floor((window.expiresAt.getTime() - Date.now()) / 1000);
    if (ttlSeconds < 1 || ttlSeconds > REVIEW_TTL_SECONDS) return unavailable();
    const token = await issueSession({
      userId: subject.id,
      externalUserId: subject.external_id,
      ttlSeconds,
      readOnlyReview: true,
    });
    const response = NextResponse.redirect(new URL("/memory-world", request.url), 303);
    setSessionCookie(response, token, ttlSeconds);
    return applyAuthNoStore(response);
  } catch {
    // The bridge fails closed on database, signing, or configuration failures.
    return unavailable();
  }
}
