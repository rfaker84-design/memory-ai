import { NextRequest, NextResponse } from "next/server";

import {
  FirstPresenceReviewerBrowserSessionSigner,
  FirstPresenceVideoReviewPreviewQuery,
  reviewerBrowserPreviewAvailable,
  type VideoReviewPreviewQueryPort,
} from "@/features/video";
import { DatabaseDependencyError } from "@/src/server/database";
import {
  authorizeVideoInternalRequest,
  getVideoInternalAccessConfiguration,
} from "@/src/server/security/video-internal-access";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ jobId: string }> };
type Dependencies = {
  artifacts: VideoReviewPreviewQueryPort;
  signer: FirstPresenceReviewerBrowserSessionSigner;
};

const TOKEN_HEADER = "x-video-review-access-token";
const REVIEWER_HEADER = "x-video-reviewer-account";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return applyAuthNoStore(NextResponse.json(body, init));
}

function dependencies(): Dependencies {
  const configuration = getVideoInternalAccessConfiguration();
  return {
    artifacts: new FirstPresenceVideoReviewPreviewQuery(),
    signer: new FirstPresenceReviewerBrowserSessionSigner(configuration.reviewToken, configuration.previousReviewToken),
  };
}

function authorized(request: NextRequest): boolean {
  return authorizeVideoInternalRequest({
    kind: "review",
    token: request.headers.get(TOKEN_HEADER),
    account: request.headers.get(REVIEWER_HEADER),
  }) !== null;
}

export function createVideoReviewBrowserSessionHandler(
  dependencyFactory: () => Dependencies = dependencies,
  accessPath = (jobId: string, token: string) =>
    `/internal/video-reviews/${encodeURIComponent(jobId)}/access?session=${encodeURIComponent(token)}`,
  available = () => reviewerBrowserPreviewAvailable(),
) {
  return {
    GET: async (request: NextRequest, { params }: Context) => {
      if (!available() || !authorized(request)) return json({ error: "VIDEO_REVIEW_UNAUTHORIZED" }, { status: 401 });
      if ([...request.nextUrl.searchParams.keys()].length !== 0) return json({ error: "INVALID_VIDEO_REVIEW_PREVIEW" }, { status: 400 });
      try {
        const { jobId } = await params;
        if (!UUID_PATTERN.test(jobId)) return json({ error: "VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE" }, { status: 404 });
        const resolved = dependencyFactory();
        if (!await resolved.artifacts.findPendingForReview({ jobId })) {
          return json({ error: "VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE" }, { status: 404 });
        }
        const session = resolved.signer.issue({ jobId, scope: "bootstrap" });
        return json({
          page: {
            url: accessPath(jobId, session.token),
            expiresAt: session.expiresAt,
          },
        });
      } catch (error) {
        if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
        console.error("[api:internal:video-review-browser-session] authorization failed");
        return json({ error: "VIDEO_REVIEW_PREVIEW_UNAVAILABLE" }, { status: 503 });
      }
    },
  };
}
