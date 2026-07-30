import { NextRequest, NextResponse } from "next/server";

import type { FirstPresenceVideoService } from "@/features/video";
import { authorizeVideoInternalRequest } from "@/src/server/security/video-internal-access";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type ReviewService = Pick<FirstPresenceVideoService, "review">;
const TOKEN_HEADER = "x-video-review-access-token";
const REVIEWER_HEADER = "x-video-reviewer-account";
const UUID_OR_JOB_PATTERN = /^[A-Za-z0-9._:-]{8,120}$/;

const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

function authorized(request: NextRequest): { ok: true; reviewerAccount: string } | { ok: false } {
  const reviewerAccount = authorizeVideoInternalRequest({
    kind: "review",
    token: request.headers.get(TOKEN_HEADER),
    account: request.headers.get(REVIEWER_HEADER),
  });
  return reviewerAccount ? { ok: true, reviewerAccount } : { ok: false };
}

function failure(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "";
  if (message === "FIRST_PRESENCE_VIDEO_JOB_NOT_FOUND") {
    return json({ error: "VIDEO_REVIEW_JOB_NOT_FOUND" }, { status: 404 });
  }
  if (message === "FIRST_PRESENCE_VIDEO_NOT_REVIEWABLE") {
    return json({ error: "VIDEO_NOT_REVIEWABLE" }, { status: 409 });
  }
  if (message === "FIRST_PRESENCE_REVIEW_REASON_REQUIRED") {
    return json({ error: "INVALID_VIDEO_REVIEW" }, { status: 400 });
  }
  console.error("[api:internal:video-reviews] operation failed");
  return json({ error: "VIDEO_REVIEW_UNAVAILABLE" }, { status: 503 });
}

export function createVideoReviewsHandler(serviceFactory: () => ReviewService) {
  return async function POST(request: NextRequest) {
    const auth = authorized(request);
    if (!auth.ok) return json({ error: "VIDEO_REVIEW_UNAUTHORIZED" }, { status: 401 });
    try {
      if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        return json({ error: "INVALID_VIDEO_REVIEW" }, { status: 400 });
      }
      const body = await request.json().catch(() => null);
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return json({ error: "INVALID_VIDEO_REVIEW" }, { status: 400 });
      }
      const input = body as Record<string, unknown>;
      if (
        Object.keys(input).sort().join(",") !== "action,jobId,reason" ||
        typeof input.jobId !== "string" ||
        !UUID_OR_JOB_PATTERN.test(input.jobId) ||
        (input.action !== "approve" && input.action !== "reject") ||
        typeof input.reason !== "string" ||
        !input.reason.trim()
      ) {
        return json({ error: "INVALID_VIDEO_REVIEW" }, { status: 400 });
      }
      const job = await serviceFactory().review({
        jobId: input.jobId,
        reviewerAccount: auth.reviewerAccount,
        action: input.action,
        reason: input.reason,
      });
      return json({ job }, { status: job.status === "succeeded" ? 202 : 200 });
    } catch (error) {
      return failure(error);
    }
  };
}
