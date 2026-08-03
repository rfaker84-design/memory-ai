import { NextRequest, NextResponse } from "next/server";

import {
  aiGeneratedPlaybackHeaders,
  FirstPresenceVideoArtifactStorageReader,
  parseSingleRange,
  VideoShareLinkError,
  VideoShareLinksPostgres,
  createVideoArtifactStorageFromEnvironment,
  type VideoArtifactReaderPort,
} from "@/features/video";
import { DatabaseDependencyError } from "@/src/server/database";

type Context = { params: Promise<{ publicId: string }> };
type Dependencies = { shares: Pick<VideoShareLinksPostgres, "findActivePublic">; reader: VideoArtifactReaderPort };
function dependencies(): Dependencies { return { shares: new VideoShareLinksPostgres(), reader: new FirstPresenceVideoArtifactStorageReader(createVideoArtifactStorageFromEnvironment()) }; }
function unavailable(status = 404) { const response = NextResponse.json({ error: "SHARE_NOT_AVAILABLE" }, { status }); response.headers.set("Cache-Control", "no-store, max-age=0"); response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive"); return response; }

export function createPublicVideoSharePlaybackHandler(factory: () => Dependencies = dependencies) {
  return { GET: async (request: NextRequest, { params }: Context) => {
    try {
      if ([...request.nextUrl.searchParams.keys()].length) return unavailable();
      const resolved = factory();
      const share = await resolved.shares.findActivePublic((await params).publicId);
      if (!share) return unavailable();
      const firstByte = await resolved.reader.readRange({ artifactKey: share.artifactKey, start: 0, end: 0 });
      const range = parseSingleRange(request.headers.get("range"), firstByte.totalBytes);
      if (range === "invalid") return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${firstByte.totalBytes}`, "Accept-Ranges": "bytes", "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow, noarchive" } });
      const body = range && (range.start !== 0 || range.end !== 0) ? await resolved.reader.readRange({ artifactKey: share.artifactKey, ...range }) : range ? firstByte : await resolved.reader.readRange({ artifactKey: share.artifactKey });
      const selected = range ?? { start: 0, end: body.totalBytes - 1 };
      if (body.totalBytes !== firstByte.totalBytes || body.body.byteLength !== selected.end - selected.start + 1) return unavailable();
      const headers = new Headers({ "Accept-Ranges": "bytes", "Content-Type": "video/mp4", "Content-Disposition": "inline; filename=memorial-video.mp4", "Content-Length": String(body.body.byteLength), "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow, noarchive" });
      for (const [name, value] of Object.entries(aiGeneratedPlaybackHeaders(share.jobId))) headers.set(name, value);
      if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${body.totalBytes}`);
      return new NextResponse(new Uint8Array(body.body), { status: range ? 206 : 200, headers });
    } catch (error) {
      if (error instanceof VideoShareLinkError) return unavailable();
      if (error instanceof DatabaseDependencyError) return unavailable(503);
      if (error instanceof Error && error.message.startsWith("STORAGE_")) return unavailable();
      console.error("[api:video-share] public playback failed"); return unavailable(503);
    }
  }};
}
