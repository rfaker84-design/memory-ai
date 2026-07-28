import { readFile } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { verifyStagingMediaUrl } from "@/src/server/runtime/staging-media";
import { getStagingRuntimeConfiguration } from "@/src/server/runtime/staging-contract";
import { resolveStagingMediaPath } from "@/src/server/storage/staging-local-media-storage";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };

function contentTypeFor(key: string): string {
  const extension = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  return ({
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
    mp4: "video/mp4", webm: "video/webm",
  } as Record<string, string>)[extension] ?? "application/octet-stream";
}

export async function GET(request: NextRequest) {
  try {
    const key = verifyStagingMediaUrl({
      key: request.nextUrl.searchParams.get("key"),
      expires: request.nextUrl.searchParams.get("expires"),
      signature: request.nextUrl.searchParams.get("signature"),
    });
    if (!key) return NextResponse.json({ error: "MEDIA_URL_INVALID" }, { status: 403, headers: NO_STORE });

    const configuration = getStagingRuntimeConfiguration();
    const body = await readFile(resolveStagingMediaPath(configuration.mediaRoot, key));
    return new NextResponse(body, {
      headers: {
        ...NO_STORE,
        "Content-Type": contentTypeFor(key),
        "Content-Disposition": "attachment",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "MEDIA_NOT_FOUND" }, { status: 404, headers: NO_STORE });
    }
    console.error("[staging-media] local media read unavailable");
    return NextResponse.json({ error: "MEDIA_UNAVAILABLE" }, { status: 503, headers: NO_STORE });
  }
}
