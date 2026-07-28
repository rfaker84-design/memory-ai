import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import type { FirstPresenceVideoService } from "@/features/video";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type ReviewService = Pick<FirstPresenceVideoService, "review">;
const TOKEN_HEADER = "x-video-review-access-token";
const REVIEWER_HEADER = "x-video-reviewer-account";
const MINIMUM_TOKEN_BYTES = 48;
const UUID_OR_JOB_PATTERN = /^[A-Za-z0-9._:-]{8,120}$/;

const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

function authorized(request: NextRequest): { ok: true; reviewerAccount: string } | { ok: false } {
  if (process.env.YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED !== "true") return { ok: false };
  const expectedToken = process.env.YIJIAN_VIDEO_REVIEW_ACCESS_TOKEN;
  const expectedReviewer = process.env.YIJIAN_VIDEO_REVIEW_ACCOUNT;
  const suppliedToken = request.headers.get(TOKEN_HEADER);
  const suppliedReviewer = request.headers.get(REVIEWER_HEADER);
  if (
    !expectedToken ||
    expectedToken !== expectedToken.trim() ||
    Buffer.byteLength(expectedToken, "utf8") < MINIMUM_TOKEN_BYTES ||
    !expectedReviewer ||
    !suppliedToken ||
    suppliedReviewer !== expectedReviewer
  ) {
    return { ok: false };
  }
  const left = Buffer.from(expectedToken);
  const right = Buffer.from(suppliedToken);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return { ok: false };
  return { ok: true, reviewerAccount: suppliedReviewer };
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
