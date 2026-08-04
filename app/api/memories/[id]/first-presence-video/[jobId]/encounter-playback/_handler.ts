import { NextRequest, NextResponse } from "next/server";

import {
  FirstPresencePlaybackAuthorizationService,
  FirstPresencePlaybackError,
  FirstPresencePlaybackSigner,
  FirstPresenceVideoArtifactQueryPort,
  InitialEncounterPlaybackClaimService,
  createVideoArtifactStorageFromEnvironment,
} from "@/features/video";
import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { getVideoArtifactRuntimeConfiguration } from "@/features/video/video-artifact-runtime";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ id: string; jobId: string }> };
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type EncounterService = Pick<InitialEncounterPlaybackClaimService, "claim">;
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

function service(): EncounterService {
  const runtime = getVideoArtifactRuntimeConfiguration();
  const playback = new FirstPresencePlaybackAuthorizationService(
    new FirstPresenceVideoArtifactQueryPort(createVideoArtifactStorageFromEnvironment()),
    new FirstPresencePlaybackSigner(runtime.signingSecret, runtime.previousSigningSecret),
  );
  return new InitialEncounterPlaybackClaimService(playback);
}

function failure(error: unknown): NextResponse {
  if (error instanceof FirstPresencePlaybackError) return json({ error: error.code }, { status: error.code === "PLAYBACK_UNAVAILABLE" ? 503 : 404 });
  if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  console.error("[api:initial-encounter] claim failed");
  return json({ error: "PLAYBACK_UNAVAILABLE" }, { status: 503 });
}

export function createInitialEncounterPlaybackHandler(serviceFactory: () => EncounterService = service, sessionResolver: SessionResolver = verifyRequestSession) {
  return {
    POST: async (request: NextRequest, { params }: Context) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        if (request.headers.get("content-type")) return json({ error: "INVALID_ENCOUNTER_REQUEST" }, { status: 400 });
        const { id: memoryId, jobId } = await params;
        const encounter = await serviceFactory().claim({ externalUserId: session.externalUserId, memoryId, jobId });
        return json({ encounter });
      } catch (error) { return failure(error); }
    },
  };
}
