import { NextRequest, NextResponse } from "next/server";
import { MediaPostgresDataSource, MediaRepository, MediaService, MediaServiceError, MediaValidationError } from "../../../features/media";
import { verifySession } from "../../../src/lib/auth";
import { createMediaStorage } from "../../../src/server/storage";

export function safeMediaAsset(asset: {
  id: string;
  mediaType: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
}) {
  return {
    id: asset.id,
    mediaType: asset.mediaType,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    status: asset.status,
    createdAt: asset.createdAt,
  };
}

export function authenticate(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const session = verifySession(header.startsWith("Bearer ") ? header.slice(7) : "");
  return session?.userId ?? null;
}

export function mediaService(): MediaService {
  return new MediaService(new MediaRepository(new MediaPostgresDataSource()), createMediaStorage(), {
    maxImageBytes: Number(process.env.MEDIA_MAX_IMAGE_BYTES) || 20 * 1024 * 1024,
    maxAudioBytes: Number(process.env.MEDIA_MAX_AUDIO_BYTES) || 100 * 1024 * 1024,
  });
}

export function mediaError(error: unknown): NextResponse {
  if (error instanceof MediaValidationError || error instanceof MediaServiceError) {
    return NextResponse.json({ error: error.code }, { status: error.httpStatus });
  }
  if (error instanceof Error && error.message === "MEDIA_MEMORY_NOT_OWNED") {
    return NextResponse.json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
  }
  if (error instanceof Error && error.message.startsWith("STORAGE_CONFIGURATION_MISSING")) {
    console.error("[media] storage configuration is incomplete");
    return NextResponse.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });
  }
  console.error("[media] request failed", error instanceof Error ? error.message : "unknown error");
  return NextResponse.json({ error: "MEDIA_OPERATION_FAILED" }, { status: 500 });
}
