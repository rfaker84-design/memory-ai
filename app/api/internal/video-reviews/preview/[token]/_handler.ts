import { NextRequest, NextResponse } from "next/server";

import {
  aiGeneratedPlaybackHeaders,
  assertReviewPreviewArtifact,
  createVideoArtifactStorageFromEnvironment,
  FirstPresenceReviewPreviewSigner,
  FirstPresenceVideoArtifactStorageReader,
  FirstPresenceVideoReviewPreviewQuery,
  parseSingleRange,
  type VideoArtifactReaderPort,
  type VideoReviewPreviewQueryPort,
  VideoReviewPreviewError,
} from "@/features/video";
import { DatabaseDependencyError } from "@/src/server/database";
import { getVideoInternalAccessConfiguration } from "@/src/server/security/video-internal-access";

type Context = { params: Promise<{ token: string }> };
type PreviewReadDependencies = {
  artifacts: VideoReviewPreviewQueryPort;
  reader: VideoArtifactReaderPort;
  signer: FirstPresenceReviewPreviewSigner;
};

function dependencies(): PreviewReadDependencies {
  const configuration = getVideoInternalAccessConfiguration();
  return {
    artifacts: new FirstPresenceVideoReviewPreviewQuery(),
    reader: new FirstPresenceVideoArtifactStorageReader(createVideoArtifactStorageFromEnvironment()),
    signer: new FirstPresenceReviewPreviewSigner(configuration.reviewToken, configuration.previousReviewToken),
  };
}

function mediaHeaders(input: {
  contentLength: number;
  totalBytes: number;
  range: { start: number; end: number } | null;
  contentId: string;
  contentType: string;
}): Headers {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": input.contentType,
    "Content-Disposition": "inline; filename=review-preview.mp4",
    "Content-Length": String(input.contentLength),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    Vary: "Origin",
  });
  for (const [name, value] of Object.entries(aiGeneratedPlaybackHeaders(input.contentId))) headers.set(name, value);
  if (input.range) headers.set("Content-Range", `bytes ${input.range.start}-${input.range.end}/${input.totalBytes}`);
  return headers;
}

function unavailable(status = 404): NextResponse {
  return NextResponse.json(
    { error: "VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE" },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );
}

export function createVideoReviewPreviewReadHandler(
  dependencyFactory: () => PreviewReadDependencies = dependencies,
) {
  const read = async (request: NextRequest, context: Context, headOnly: boolean): Promise<NextResponse> => {
    try {
      if ([...request.nextUrl.searchParams.keys()].length !== 0) return unavailable();
      const token = (await context.params).token;
      const resolved = dependencyFactory();
      const claims = resolved.signer.verify(token);
      if (!claims) return unavailable();
      const artifact = await resolved.artifacts.findPendingForReview({ jobId: claims.jobId });
      const playable = assertReviewPreviewArtifact({ signer: resolved.signer, token, artifact });
      // Establish total length before parsing an untrusted Range header. The
      // reviewer token never chooses an object key.
      const firstByte = await resolved.reader.readRange({ artifactKey: playable.artifactKey, start: 0, end: 0 });
      const range = parseSingleRange(request.headers.get("range"), firstByte.totalBytes);
      if (range === "invalid") {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${firstByte.totalBytes}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, no-store, max-age=0",
            Pragma: "no-cache",
            "Referrer-Policy": "no-referrer",
            "X-Robots-Tag": "noindex, nofollow, noarchive",
          },
        });
      }
      const selectedRange = range ?? { start: 0, end: firstByte.totalBytes - 1 };
      const body = headOnly
        ? firstByte
        : range && (range.start !== 0 || range.end !== 0)
          ? await resolved.reader.readRange({ artifactKey: playable.artifactKey, ...range })
          : range
            ? firstByte
            : await resolved.reader.readRange({ artifactKey: playable.artifactKey });
      if (
        body.totalBytes !== firstByte.totalBytes
        || (!headOnly && body.body.byteLength !== selectedRange.end - selectedRange.start + 1)
      ) return unavailable();
      const headers = mediaHeaders({
        contentLength: headOnly ? selectedRange.end - selectedRange.start + 1 : body.body.byteLength,
        totalBytes: body.totalBytes,
        range: range ?? null,
        contentId: playable.jobId,
        contentType: body.contentType,
      });
      if (headOnly) return new NextResponse(null, { status: range ? 206 : 200, headers });
      const responseBody = new Uint8Array(body.body.byteLength);
      responseBody.set(body.body);
      return new NextResponse(responseBody, { status: range ? 206 : 200, headers });
    } catch (error) {
      if (error instanceof VideoReviewPreviewError) {
        return unavailable(error.code === "VIDEO_REVIEW_PREVIEW_UNAVAILABLE" ? 503 : 404);
      }
      if (error instanceof DatabaseDependencyError) return unavailable(503);
      if (error instanceof Error && error.message.startsWith("STORAGE_")) return unavailable();
      console.error("[api:internal:video-review-preview] asset read failed");
      return unavailable();
    }
  };

  return {
    GET: (request: NextRequest, context: Context) => read(request, context, false),
    HEAD: (request: NextRequest, context: Context) => read(request, context, true),
  };
}
