import { NextRequest, NextResponse } from "next/server";

import { VideoShareLinkError, VideoShareLinksPostgres } from "@/features/video";
import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ id: string; publicId: string }> };
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type Shares = Pick<VideoShareLinksPostgres, "revokeForOwner">;
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

export function createOwnerVideoShareRevokeHandler(shares: Shares = new VideoShareLinksPostgres(), sessionResolver: SessionResolver = verifyRequestSession) {
  return { DELETE: async (request: NextRequest, { params }: Context) => {
    try {
      const session = await sessionResolver(request);
      if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
      requireAllowedOrigin(request);
      if ([...request.nextUrl.searchParams.keys()].length) return json({ error: "INVALID_SHARE_REQUEST" }, { status: 400 });
      const { id: memoryId, publicId } = await params;
      const revoked = await shares.revokeForOwner({ externalUserId: session.externalUserId, memoryId, publicId });
      return revoked ? json({ revoked: true }) : json({ error: "SHARE_NOT_AVAILABLE" }, { status: 404 });
    } catch (error) {
      if (error instanceof VideoShareLinkError) return json({ error: error.code }, { status: error.code === "SHARE_NOT_AVAILABLE" ? 404 : 400 });
      if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
      if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? error.code : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
      console.error("[api:video-share] revoke failed"); return json({ error: "VIDEO_SHARE_REQUEST_FAILED" }, { status: 500 });
    }
  }};
}
