import { NextRequest, NextResponse } from "next/server";

import {
  FirstPresenceReviewPreviewSigner,
  FirstPresenceVideoReviewPreviewQuery,
  type VideoReviewPreviewQueryPort,
} from "@/features/video";
import { DatabaseDependencyError } from "@/src/server/database";
import {
  authorizeVideoInternalRequest,
  getVideoInternalAccessConfiguration,
} from "@/src/server/security/video-internal-access";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ jobId: string }> };
type PreviewDependencies = {
  artifacts: VideoReviewPreviewQueryPort;
  signer: FirstPresenceReviewPreviewSigner;
};

const TOKEN_HEADER = "x-video-review-access-token";
const REVIEWER_HEADER = "x-video-reviewer-account";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

function dependencies(): PreviewDependencies {
  const configuration = getVideoInternalAccessConfiguration();
  return {
    artifacts: new FirstPresenceVideoReviewPreviewQuery(),
    signer: new FirstPresenceReviewPreviewSigner(configuration.reviewToken, configuration.previousReviewToken),
  };
}

function authorized(request: NextRequest): boolean {
  return authorizeVideoInternalRequest({
    kind: "review",
    token: request.headers.get(TOKEN_HEADER),
    account: request.headers.get(REVIEWER_HEADER),
  }) !== null;
}

export function createVideoReviewPreviewAuthorizationHandler(
  dependencyFactory: () => PreviewDependencies = dependencies,
  assetPath = (token: string) => `/api/internal/video-reviews/preview/${encodeURIComponent(token)}`,
) {
  return {
    GET: async (request: NextRequest, { params }: Context) => {
      if (!authorized(request)) return json({ error: "VIDEO_REVIEW_UNAUTHORIZED" }, { status: 401 });
      try {
        if ([...request.nextUrl.searchParams.keys()].length !== 0) {
          return json({ error: "INVALID_VIDEO_REVIEW_PREVIEW" }, { status: 400 });
        }
        const { jobId } = await params;
        if (!UUID_PATTERN.test(jobId)) return json({ error: "VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE" }, { status: 404 });
        const resolved = dependencyFactory();
        const artifact = await resolved.artifacts.findPendingForReview({ jobId });
        if (!artifact) return json({ error: "VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE" }, { status: 404 });
        const signed = resolved.signer.issue({ artifact });
        return json({
          preview: {
            url: assetPath(signed.token),
            expiresAt: signed.expiresAt,
            contentDisposition: "inline",
          },
        });
      } catch (error) {
        if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
        console.error("[api:internal:video-review-preview] authorization failed");
        return json({ error: "VIDEO_REVIEW_PREVIEW_UNAVAILABLE" }, { status: 503 });
      }
    },
  };
}
