import { NextRequest, NextResponse } from "next/server";
import { authenticate, mediaError, mediaService } from "../_lib";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Context) {
  const userId = authenticate(req);
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const { id } = await context.params;
    const requestedTtl = Number(req.nextUrl.searchParams.get("expiresIn") ?? "300");
    return NextResponse.json(await mediaService().createDownloadUrl(id, userId, requestedTtl));
  } catch (error) { return mediaError(error); }
}

export async function DELETE(req: NextRequest, context: Context) {
  const userId = authenticate(req);
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const { id } = await context.params;
    return NextResponse.json({ asset: await mediaService().delete(id, userId), cleanup: "scheduled" });
  } catch (error) { return mediaError(error); }
}
