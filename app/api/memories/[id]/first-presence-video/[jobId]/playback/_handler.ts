import { NextRequest, NextResponse } from "next/server";

import {
  FirstPresencePlaybackAuthorizationService,
  FirstPresencePlaybackError,
  FirstPresencePlaybackSigner,
  FirstPresenceVideoArtifactQueryPort,
  createVideoArtifactStorageFromEnvironment,
  type PlaybackAuthorizationDto,
} from "@/features/video";
import { AuthConfigurationError, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ id: string; jobId: string }> };
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type PlaybackAuthorizationService = Pick<FirstPresencePlaybackAuthorizationService, "authorize">;

const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

function service(): PlaybackAuthorizationService {
  const secret = process.env.YIJIAN_VIDEO_PLAYBACK_SIGNING_SECRET;
  if (!secret) throw new FirstPresencePlaybackError("PLAYBACK_UNAVAILABLE");
  return new FirstPresencePlaybackAuthorizationService(
    new FirstPresenceVideoArtifactQueryPort(createVideoArtifactStorageFromEnvironment()),
    new FirstPresencePlaybackSigner(secret),
  );
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
