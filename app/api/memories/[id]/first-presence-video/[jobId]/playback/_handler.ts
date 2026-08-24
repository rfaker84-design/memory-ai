import { NextRequest, NextResponse } from "next/server";

import {
  FirstPresencePlaybackAuthorizationService,
  FirstPresencePlaybackError,
  FirstPresencePlaybackSigner,
  FirstPresenceVideoArtifactQueryPort,
  createVideoArtifactStorageFromEnvironment,
  type PlaybackAuthorizationDto,
  type ApprovedVideoArtifact,
} from "@/features/video";
import { AuthConfigurationError, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import {
  findStagingOwnerReadOnlyApprovedIdle,
  resolveStagingOwnerReadOnlyReviewForSession,
} from "@/src/server/auth/staging-owner-readonly-review";
import { DatabaseDependencyError } from "@/src/server/database";
import { getVideoArtifactRuntimeConfiguration } from "@/features/video/video-artifact-runtime";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ id: string; jobId: string }> };
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type PlaybackAuthorizationService = Pick<FirstPresencePlaybackAuthorizationService, "authorize">;

const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

function service(): PlaybackAuthorizationService {
  const signing = getVideoArtifactRuntimeConfiguration();
  return new FirstPresencePlaybackAuthorizationService(
    new FirstPresenceVideoArtifactQueryPort(createVideoArtifactStorageFromEnvironment()),
    new FirstPresencePlaybackSigner(signing.signingSecret, signing.previousSigningSecret),
  );
}

function reviewIdleArtifact(input: { memoryId: string; jobId: string; artifactKey: string }): ApprovedVideoArtifact {
  return {
    memoryId: input.memoryId,
    jobId: input.jobId,
    artifactKey: input.artifactKey,
    // These two fields are never returned for the direct review path.  The
    // signed application playback URL below is the only browser-facing value.
    playbackUrl: "",
    playbackExpiresAt: "",
    presentation: "additional_generation",
    saveAllowed: false,
    motionVariant: "idle",
  };
}

async function authorizeStagingVisualRepairIdle(input: {
  session: AuthSession;
  memoryId: string;
  jobId: string;
}): Promise<PlaybackAuthorizationDto | null> {
  if (!input.session.stagingVisualRepair) return null;
  const review = await resolveStagingOwnerReadOnlyReviewForSession(input.session);
  if (!review || review.memoryId !== input.memoryId) return null;
  const idle = await findStagingOwnerReadOnlyApprovedIdle({
    userId: review.userId,
    memoryId: review.memoryId,
    jobId: input.jobId,
  });
  if (!idle) return null;
  const runtime = getVideoArtifactRuntimeConfiguration();
  const signed = new FirstPresencePlaybackSigner(runtime.signingSecret, runtime.previousSigningSecret).issue({
    artifact: reviewIdleArtifact({ memoryId: review.memoryId, jobId: idle.jobId, artifactKey: idle.artifactKey }),
    externalUserId: input.session.externalUserId,
  });
  return {
    url: `/api/first-presence-video/playback/${encodeURIComponent(signed.token)}`,
    expiresAt: signed.expiresAt,
    contentDisposition: "inline",
    saveAllowed: false,
  };
}

function failure(error: unknown): NextResponse {
  if (error instanceof FirstPresencePlaybackError) {
    return json(
      { error: error.code },
      { status: error.code === "PLAYBACK_UNAVAILABLE" ? 503 : 404 },
    );
  }
  if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  if (error instanceof AuthConfigurationError) return json({ error: "AUTH_UNAVAILABLE" }, { status: 503 });
  console.error("[api:first-presence-playback] authorization failed");
  return json({ error: "PLAYBACK_UNAVAILABLE" }, { status: 503 });
}

export function createFirstPresencePlaybackAuthorizationHandler(
  serviceFactory: () => PlaybackAuthorizationService = service,
  sessionResolver: SessionResolver = verifyRequestSession,
) {
  return {
    GET: async (request: NextRequest, { params }: Context) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        if ([...request.nextUrl.searchParams.keys()].length > 0) {
          return json({ error: "INVALID_PLAYBACK_REQUEST" }, { status: 400 });
        }
        const { id: memoryId, jobId } = await params;
        if (session.readOnlyReview || session.stagingVisualRepair) {
          const review = await resolveStagingOwnerReadOnlyReviewForSession(session);
          if (!review || review.memoryId !== memoryId) return json({ error: "PLAYBACK_NOT_AVAILABLE" }, { status: 404 });
        }
        const visualRepairPlayback = await authorizeStagingVisualRepairIdle({ session, memoryId, jobId });
        if (session.stagingVisualRepair) {
          return visualRepairPlayback
            ? json({ playback: visualRepairPlayback })
            : json({ error: "PLAYBACK_NOT_AVAILABLE" }, { status: 404 });
        }
        const playback: PlaybackAuthorizationDto = await serviceFactory().authorize({
          externalUserId: session.externalUserId,
          memoryId,
          jobId,
        });
        return json({ playback });
      } catch (error) {
        return failure(error);
      }
    },
  };
}
