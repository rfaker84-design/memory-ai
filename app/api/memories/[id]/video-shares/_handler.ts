import { NextRequest, NextResponse } from "next/server";

import { VideoShareLinkError, VideoShareLinksPostgres, type OwnerVideoShareLink } from "@/features/video";
import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import { blockedHighRiskResponse } from "@/features/understanding-assistance/understanding-assistance";
import { defaultUnderstandingAssistanceGuard, UnderstandingAssistanceError, type UnderstandingAssistanceGuard } from "@/features/understanding-assistance/understanding-assistance-postgres";

type Context = { params: Promise<{ id: string }> };
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type Shares = Pick<VideoShareLinksPostgres, "createForOwner" | "listForOwner">;
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

function parse(body: unknown): { jobId: string; title: string } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (Object.keys(value).sort().join(",") !== "jobId,title" || typeof value.jobId !== "string" || typeof value.title !== "string") return null;
  return { jobId: value.jobId, title: value.title };
}

function failure(error: unknown): NextResponse {
  if (error instanceof UnderstandingAssistanceError) {
    return error.code === "UNDERSTANDING_ASSISTANCE_REQUIRED"
      ? json(blockedHighRiskResponse("public_share"), { status: 409 })
      : json({ error: error.code }, { status: error.code === "ACCOUNT_NOT_FOUND" ? 404 : 409 });
  }
  if (error instanceof VideoShareLinkError) return json({ error: error.code }, { status: error.code === "SHARE_NOT_AVAILABLE" ? 404 : 400 });
  if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? error.code : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  console.error("[api:video-share] create failed");
  return json({ error: "VIDEO_SHARE_REQUEST_FAILED" }, { status: 500 });
}

export function createOwnerVideoShareHandler(
  shares: Shares = new VideoShareLinksPostgres(),
  sessionResolver: SessionResolver = verifyRequestSession,
  assistanceGuard: UnderstandingAssistanceGuard = defaultUnderstandingAssistanceGuard(),
) {
  return {
  GET: async (request: NextRequest, { params }: Context) => {
    try {
      const session = await sessionResolver(request);
      if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
      if ([...request.nextUrl.searchParams.keys()].length) return json({ error: "INVALID_SHARE_REQUEST" }, { status: 400 });
      const { id: memoryId } = await params;
      return json({ shares: await shares.listForOwner({ externalUserId: session.externalUserId, memoryId }) });
    } catch (error) { return failure(error); }
  },
  POST: async (request: NextRequest, { params }: Context) => {
    try {
      const session = await sessionResolver(request);
      if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
      requireAllowedOrigin(request);
      const body = parse(await request.json().catch(() => null));
      if (!body) return json({ error: "INVALID_SHARE_REQUEST" }, { status: 400 });
      await assistanceGuard.assertHighRiskAllowed({ userId: session.userId, externalUserId: session.externalUserId, operation: "public_share" });
      const { id: memoryId } = await params;
      const share: OwnerVideoShareLink = await shares.createForOwner({ externalUserId: session.externalUserId, memoryId, ...body });
      return json({ share }, { status: 201 });
    } catch (error) { return failure(error); }
  }};
}
