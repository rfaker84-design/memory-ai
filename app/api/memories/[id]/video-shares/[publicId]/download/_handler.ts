import { NextRequest, NextResponse } from "next/server";

import {
  createVideoArtifactStorageFromEnvironment,
  FfmpegWatermarkedVideoRenderer,
  OwnerWatermarkedShareDownloadService,
  VideoShareLinkError,
  VideoShareLinksPostgres,
  WatermarkedShareDownloadError,
} from "@/features/video";
import { AuthConfigurationError, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ id: string; publicId: string }> };
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type DownloadService = Pick<OwnerWatermarkedShareDownloadService, "prepare">;

function service(): DownloadService {
  return new OwnerWatermarkedShareDownloadService(new VideoShareLinksPostgres(), createVideoArtifactStorageFromEnvironment(), new FfmpegWatermarkedVideoRenderer());
}

const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

function failure(error: unknown): NextResponse {
  if (error instanceof WatermarkedShareDownloadError) return json({ error: error.code === "SHARE_DOWNLOAD_NOT_AVAILABLE" ? "SHARE_NOT_AVAILABLE" : "VIDEO_SHARE_DOWNLOAD_UNAVAILABLE" }, { status: error.code === "SHARE_DOWNLOAD_NOT_AVAILABLE" ? 404 : 503 });
  if (error instanceof VideoShareLinkError) return json({ error: error.code }, { status: error.code === "SHARE_NOT_AVAILABLE" ? 404 : 400 });
  if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  if (error instanceof AuthConfigurationError) return json({ error: "AUTH_UNAVAILABLE" }, { status: 503 });
  console.error("[api:video-share] Owner watermark download failed");
  return json({ error: "VIDEO_SHARE_DOWNLOAD_UNAVAILABLE" }, { status: 503 });
}

export function createOwnerWatermarkedVideoDownloadHandler(serviceFactory: () => DownloadService = service, sessionResolver: SessionResolver = verifyRequestSession) {
  return { GET: async (request: NextRequest, { params }: Context) => {
    try {
      const session = await sessionResolver(request);
      if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
      if ([...request.nextUrl.searchParams.keys()].length) return json({ error: "INVALID_SHARE_REQUEST" }, { status: 400 });
      const { id: memoryId, publicId } = await params;
      const download = await serviceFactory().prepare({ externalUserId: session.externalUserId, memoryId, publicId });
      return applyAuthNoStore(new NextResponse(new Uint8Array(download.body), {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(download.body.byteLength),
          "Content-Disposition": `attachment; filename=${download.fileName}`,
          "X-Content-Type-Options": "nosniff",
        },
      }));
    } catch (error) { return failure(error); }
  }};
}
