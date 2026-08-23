import { NextRequest, NextResponse } from "next/server";

import { verifyRequestSession } from "@/src/server/auth";
import {
  findStagingOwnerReadOnlyApprovedIdle,
  resolveStagingOwnerReadOnlyReviewForSession,
} from "@/src/server/auth/staging-owner-readonly-review";
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ApprovedIdleSlot = Readonly<{
  jobId: string;
  variant: "idle";
  status: "succeeded";
  artifactAvailable: true;
}>;
function unavailable(): NextResponse {
  return applyAuthNoStore(new NextResponse(null, { status: 404 }));
}

async function readOnlyReviewSubject(request: NextRequest): Promise<{ subject: { id: string; external_id: string }; memoryId: string } | null> {
  const session = await verifyRequestSession(request);
  const subject = await resolveStagingOwnerReadOnlyReviewForSession(session);
  return subject ? {
    subject: { id: subject.userId, external_id: subject.externalUserId },
    memoryId: subject.memoryId,
  } : null;
}

async function readOnlyCompanionMotion(request: NextRequest): Promise<NextResponse> {
  if ([...request.nextUrl.searchParams.keys()].join(",") !== REVIEW_COMPANION_MOTION_QUERY) return unavailable();
  const review = await readOnlyReviewSubject(request);
  if (!review) return unavailable();
  const idle = await findStagingOwnerReadOnlyApprovedIdle({ userId: review.subject.id, memoryId: review.memoryId });
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
  const idle = await findStagingOwnerReadOnlyApprovedIdle({ userId: review.subject.id, memoryId: review.memoryId, jobId });
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
  const idle = await findStagingOwnerReadOnlyApprovedIdle({ userId: review.subject.id, memoryId: review.memoryId, jobId: claims.jobId });
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
 * A Staging-only, Nginx-origin-bound helper for the no-Cookie direct review.
 * Normal page navigation never reaches this route; it only serves the narrow
 * approved-idle responses required by the existing companion client.
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

  return unavailable();
}
