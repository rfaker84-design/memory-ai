import { NextRequest, NextResponse } from "next/server";

import {
  FirstPresenceReviewerBrowserSessionSigner,
  FirstPresenceVideoReviewPreviewQuery,
  REVIEWER_BROWSER_SESSION_COOKIE,
  REVIEWER_BROWSER_SESSION_TTL_SECONDS,
  reviewerBrowserPreviewAvailable,
} from "@/features/video";
import { getVideoInternalAccessConfiguration } from "@/src/server/security/video-internal-access";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ jobId: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailable(): NextResponse {
  const response = applyAuthNoStore(NextResponse.json({ error: "VIDEO_REVIEW_PREVIEW_NOT_AVAILABLE" }, { status: 404 }));
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest, { params }: Context) {
  if (!reviewerBrowserPreviewAvailable()) return unavailable();
  const { jobId } = await params;
  const session = request.nextUrl.searchParams.get("session");
  if (!UUID_PATTERN.test(jobId) || !session || request.nextUrl.searchParams.size !== 1) return unavailable();
  try {
    const configuration = getVideoInternalAccessConfiguration();
    const signer = new FirstPresenceReviewerBrowserSessionSigner(configuration.reviewToken, configuration.previousReviewToken);
    if (!signer.verify({ token: session, scope: "bootstrap", jobId })) return unavailable();
    const artifact = await new FirstPresenceVideoReviewPreviewQuery().findPendingForReview({ jobId });
    if (!artifact) return unavailable();
    const browserSession = signer.issue({ jobId, scope: "session" });
    const response = applyAuthNoStore(NextResponse.redirect(new URL(`/internal/video-reviews/${encodeURIComponent(jobId)}`, request.url)));
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.cookies.set({
      name: REVIEWER_BROWSER_SESSION_COOKIE,
      value: browserSession.token,
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: REVIEWER_BROWSER_SESSION_TTL_SECONDS,
    });
    return response;
  } catch {
    return unavailable();
  }
}
