import { NextRequest, NextResponse } from "next/server";
import { authenticate, mediaError, mediaService, requireMediaMutationOrigin, safeMediaAsset } from "../_lib";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await authenticate(req);
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const originError = requireMediaMutationOrigin(req);
  if (originError) return originError;
  try {
    const contentLength = Number(req.headers.get("content-length") ?? "0");
    const requestLimit = (Number(process.env.MEDIA_MAX_AUDIO_BYTES) || 100 * 1024 * 1024) + 1024 * 1024;
    if (contentLength > requestLimit) {
      return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 413 });
    }
    const form = await req.formData();
    const file = form.get("file");
    const memoryId = form.get("memoryId");
    if (!(file instanceof File) || typeof memoryId !== "string" || !/^[0-9a-f-]{36}$/i.test(memoryId)) {
      return NextResponse.json({ error: "INVALID_UPLOAD_REQUEST" }, { status: 400 });
    }
    const result = await mediaService().upload({ externalUserId: userId, memoryId,
      file: { name: file.name, type: file.type, body: Buffer.from(await file.arrayBuffer()) } });
    return NextResponse.json({ asset: safeMediaAsset(result.asset), duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
  } catch (error) { return mediaError(error); }
}
