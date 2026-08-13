import { NextRequest } from "next/server";
import { authenticate, mediaError, mediaJson, mediaService, requireMediaMutationOrigin, safeMediaAsset } from "../_lib";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const userId = await authenticate(req);
  if (!userId) return mediaJson({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const { id } = await context.params;
    const requestedTtl = Number(req.nextUrl.searchParams.get("expiresIn") ?? "300");
    const result = await mediaService().createDownloadUrl(id, userId, requestedTtl);
    return mediaJson({ ...result, asset: safeMediaAsset(result.asset) });
  } catch (error) { return mediaError(error); }
}

export async function DELETE(req: NextRequest, context: Context) {
  const userId = await authenticate(req);
  if (!userId) return mediaJson({ error: "UNAUTHORIZED" }, { status: 401 });
  const originError = requireMediaMutationOrigin(req);
  if (originError) return originError;
  try {
    const { id } = await context.params;
    return mediaJson({ asset: safeMediaAsset(await mediaService().delete(id, userId)), cleanup: "scheduled" });
  } catch (error) { return mediaError(error); }
}

export async function POST(req: NextRequest, context: Context) {
  const userId = await authenticate(req);
  if (!userId) return mediaJson({ error: "UNAUTHORIZED" }, { status: 401 });
  const originError = requireMediaMutationOrigin(req);
  if (originError) return originError;
  try {
    const { id } = await context.params;
    return mediaJson({ asset: safeMediaAsset(await mediaService().recheckPortraitQuality(id, userId)) });
  } catch (error) { return mediaError(error); }
}
