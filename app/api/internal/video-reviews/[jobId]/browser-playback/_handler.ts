import { NextRequest, NextResponse } from "next/server";

import {
  FirstPresenceReviewerBrowserSessionSigner,
  FirstPresenceReviewPreviewSigner,
  FirstPresenceVideoReviewPreviewQuery,
  reviewerBrowserPreviewAvailable,
  REVIEWER_BROWSER_SESSION_COOKIE,
  type VideoReviewPreviewQueryPort,
} from "@/features/video";
import { DatabaseDependencyError } from "@/src/server/database";
import { getVideoInternalAccessConfiguration } from "@/src/server/security/video-internal-access";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ jobId: string }> };
type Dependencies = {
  artifacts: VideoReviewPreviewQueryPort;
  browserSigner: FirstPresenceReviewerBrowserSessionSigner;
  mediaSigner: FirstPresenceReviewPreviewSigner;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return applyAuthNoStore(NextResponse.json(body, init));
}

function dependencies(): Dependencies {
  const configuration = getVideoInternalAccessConfiguration();
  return {
    artifacts: new FirstPresenceVideoReviewPreviewQuery(),
    browserSigner: new FirstPresenceReviewerBrowserSessionSigner(configuration.reviewToken, configuration.previousReviewToken),
    mediaSigner: new FirstPresenceReviewPreviewSigner(configuration.reviewToken, configuration.previousReviewToken),
  };
}

export function createVideoReviewBrowserPlaybackHandler(
  dependencyFactory: () => Dependencies = dependencies,
  assetPath = (token: string) => `/api/internal/video-reviews/preview/${encodeURIComponent(token)}`,
  available = () => reviewerBrowserPreviewAvailable(),
) {
  return {
    GET: async (request: NextRequest, { params }: Context) => {
      if (!available()) return json({ error: "VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE" }, { status: 404 });
      if ([...request.nextUrl.searchParams.keys()].length !== 0) return json({ error: "VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE" }, { status: 404 });
      try {
        const { jobId } = await params;
        if (!UUID_PATTERN.test(jobId)) return json({ error: "VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE" }, { status: 404 });
        const resolved = dependencyFactory();
        const session = resolved.browserSigner.verify({
          token: request.cookies.get(REVIEWER_BROWSER_SESSION_COOKIE)?.value,
          scope: "session",
          jobId,
        });
        if (!session) return json({ error: "VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE" }, { status: 404 });
        const artifact = await resolved.artifacts.findPendingForReview({ jobId });
        if (!artifact) return json({ error: "VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE" }, { status: 404 });
        const signed = resolved.mediaSigner.issue({ artifact });
        return json({ playback: { url: assetPath(signed.token), expiresAt: signed.expiresAt } });
      } catch (error) {
        if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
        console.error("[api:internal:video-review-browser-playback] authorization failed");
        return json({ error: "VIDEO_REVIEW_PREVIEW_UNAVAILABLE" }, { status: 503 });
      }
    },
  };
}
