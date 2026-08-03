import { NextRequest, NextResponse } from "next/server";

import { VideoShareLinkError, VideoShareLinksPostgres } from "@/features/video";
import { DatabaseDependencyError } from "@/src/server/database";

type Context = { params: Promise<{ publicId: string }> };
type Shares = Pick<VideoShareLinksPostgres, "findActivePublic">;

function json(body: Record<string, unknown>, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export function createPublicVideoShareHandler(shares: Shares = new VideoShareLinksPostgres()) {
  return { GET: async (request: NextRequest, { params }: Context) => {
    try {
      if ([...request.nextUrl.searchParams.keys()].length) return json({ error: "SHARE_NOT_AVAILABLE" }, { status: 404 });
      const share = await shares.findActivePublic((await params).publicId);
      if (!share) return json({ error: "SHARE_NOT_AVAILABLE" }, { status: 404 });
      return json({ share: { id: share.publicId, title: share.title, aiGenerated: true, viewOnly: true } });
    } catch (error) {
      if (error instanceof VideoShareLinkError) return json({ error: error.code === "INVALID_SHARE_REQUEST" ? "SHARE_NOT_AVAILABLE" : error.code }, { status: 404 });
      if (error instanceof DatabaseDependencyError) return json({ error: "SHARE_UNAVAILABLE" }, { status: 503 });
      console.error("[api:video-share] public read failed"); return json({ error: "SHARE_UNAVAILABLE" }, { status: 503 });
    }
  }};
}
