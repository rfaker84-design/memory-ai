import { NextRequest, NextResponse } from "next/server";

import {
  assertPlayableArtifact,
  FirstPresenceVideoArtifactQueryPort,
  FirstPresenceVideoArtifactStorageReader,
  FirstPresencePlaybackError,
  FirstPresencePlaybackSigner,
  createVideoArtifactStorageFromEnvironment,
  parseSingleRange,
  type VideoArtifactQueryPort,
  type VideoArtifactReaderPort,
} from "@/features/video";
import { type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ token: string }> };
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;

type PlaybackReadDependencies = {
  artifacts: VideoArtifactQueryPort;
  reader: VideoArtifactReaderPort;
  signer: FirstPresencePlaybackSigner;
};

function dependencies(): PlaybackReadDependencies {
  const secret = process.env.VIDEO_ARTIFACT_SIGNING_SECRET;
  if (!secret) throw new FirstPresencePlaybackError("PLAYBACK_UNAVAILABLE");
  return {
    artifacts: new FirstPresenceVideoArtifactQueryPort(createVideoArtifactStorageFromEnvironment()),
    reader: new FirstPresenceVideoArtifactStorageReader(createVideoArtifactStorageFromEnvironment()),
    signer: new FirstPresencePlaybackSigner(secret),
  };
}

function unavailable(status = 404): NextResponse {
  return applyAuthNoStore(NextResponse.json({ error: "PLAYBACK_NOT_AVAILABLE" }, { status }));
}

function responseHeaders(input: { contentLength: number; totalBytes: number; range: { start: number; end: number } | null }) {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": "video/mp4",
    "Content-Disposition": "inline; filename=first-presence.mp4",
    "Content-Length": String(input.contentLength),
    "X-Content-Type-Options": "nosniff",
  });
  if (input.range) headers.set("Content-Range", `bytes ${input.range.start}-${input.range.end}/${input.totalBytes}`);
  return headers;
}

export function createFirstPresencePlaybackReadHandler(
  dependencyFactory: () => PlaybackReadDependencies = dependencies,
  sessionResolver: SessionResolver = verifyRequestSession,
) {
  return {
    GET: async (request: NextRequest, { params }: Context) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return unavailable(401);
        if ([...request.nextUrl.searchParams.keys()].length > 0) return unavailable();
        const token = (await params).token;
        const resolved = dependencyFactory();
        const claims = resolved.signer.verify(token);
        if (!claims) return unavailable();
        const artifact = await resolved.artifacts.findApprovedForOwner({
          externalUserId: session.externalUserId,
          memoryId: claims.memoryId,
          jobId: claims.jobId,
        });
        const playable = assertPlayableArtifact({
          signer: resolved.signer,
          token,
          externalUserId: session.externalUserId,
          artifact,
        });

        // The first byte establishes the authoritative object length before a
        // Range header is accepted. The client never selects an object key.
        const firstByte = await resolved.reader.readRange({ artifactKey: playable.artifactKey, start: 0, end: 0 });
        const range = parseSingleRange(request.headers.get("range"), firstByte.totalBytes);
        if (range === "invalid") {
          return applyAuthNoStore(new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${firstByte.totalBytes}`, "Accept-Ranges": "bytes" },
          }));
        }
        const body = range && (range.start !== 0 || range.end !== 0)
          ? await resolved.reader.readRange({ artifactKey: playable.artifactKey, ...range })
          : range
            ? firstByte
            : await resolved.reader.readRange({ artifactKey: playable.artifactKey });
        const selectedRange = range ?? { start: 0, end: body.totalBytes - 1 };
        if (body.totalBytes !== firstByte.totalBytes || body.body.byteLength !== selectedRange.end - selectedRange.start + 1) {
          return unavailable();
        }
        const responseBody = new Uint8Array(body.body.byteLength);
        responseBody.set(body.body);
        return applyAuthNoStore(new NextResponse(responseBody, {
          status: range ? 206 : 200,
          headers: responseHeaders({
            contentLength: body.body.byteLength,
            totalBytes: body.totalBytes,
            range: range ?? null,
          }),
        }));
      } catch (error) {
        if (error instanceof FirstPresencePlaybackError) {
          return unavailable(error.code === "PLAYBACK_UNAVAILABLE" ? 503 : 404);
        }
        if (error instanceof DatabaseDependencyError) {
          return applyAuthNoStore(NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 }));
        }
        if (error instanceof Error && error.message.startsWith("STORAGE_")) return unavailable();
        console.error("[api:first-presence-playback] asset read failed");
        return unavailable();
      }
    },
  };
}
