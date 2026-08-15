import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import {
  FirstPresenceReviewPreviewSigner,
  type PendingVideoReviewArtifact,
  type VideoArtifactReaderPort,
} from "@/features/video";
import { createVideoReviewPreviewAuthorizationHandler } from "./[jobId]/preview/_handler";
import { createVideoReviewPreviewReadHandler } from "./preview/[token]/_handler";

const REVIEW_TOKEN = "review-token-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const RECONCILIATION_TOKEN = "reconcile-token-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const REVIEWER = "staging-reviewer";
const JOB_ID = "a9820889-30ec-47b7-9d9e-c5d17106cbd6";
const artifact: PendingVideoReviewArtifact = {
  jobId: JOB_ID,
  artifactKey: `video-artifacts/${JOB_ID}.mp4`,
};

process.env.YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED = "true";
process.env.YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED = "true";
process.env.VIDEO_REVIEW_ACCESS_TOKEN = REVIEW_TOKEN;
process.env.VIDEO_RECONCILIATION_ACCESS_TOKEN = RECONCILIATION_TOKEN;
process.env.YIJIAN_VIDEO_REVIEW_ACCOUNT = REVIEWER;
process.env.YIJIAN_VIDEO_RECONCILIATION_ACCOUNT = "staging-reconciler";

function context(jobId = JOB_ID) {
  return { params: Promise.resolve({ jobId }) };
}

function tokenContext(token: string) {
  return { params: Promise.resolve({ token }) };
}

function reviewerHeaders() {
  return {
    "x-video-review-access-token": REVIEW_TOKEN,
    "x-video-reviewer-account": REVIEWER,
  };
}

const reader: VideoArtifactReaderPort = {
  async readRange(input) {
    assert.equal(input.artifactKey, artifact.artifactKey);
    const body = Buffer.from("0123456789");
    const start = input.start ?? 0;
    const end = input.end ?? body.byteLength - 1;
    return { body: body.subarray(start, end + 1), contentType: "video/mp4", totalBytes: body.byteLength };
  },
};

test("reviewer preview issues only a short exact-job token and streams the pending artifact with Range and HEAD", async () => {
  const signer = new FirstPresenceReviewPreviewSigner(REVIEW_TOKEN);
  const query = { findPendingForReview: async ({ jobId }: { jobId: string }) => jobId === JOB_ID ? artifact : null };
  const issuer = createVideoReviewPreviewAuthorizationHandler(
    () => ({ artifacts: query, signer }),
  );
  const issued = await issuer.GET(new NextRequest(`https://memoryai.test/api/internal/video-reviews/${JOB_ID}/preview`, {
    headers: reviewerHeaders(),
  }), context());
  assert.equal(issued.status, 200);
  assert.equal(issued.headers.get("cache-control"), "private, no-store, max-age=0");
  const body = await issued.json() as { preview: { url: string; expiresAt: string } };
  assert.match(body.preview.url, /^\/api\/internal\/video-reviews\/preview\//);
  assert.doesNotMatch(body.preview.url, /video-artifacts|\.mp4/);
  assert.ok(Date.parse(body.preview.expiresAt) - Date.now() <= 61_000);
  const token = body.preview.url.split("/").at(-1)!;

  const stream = createVideoReviewPreviewReadHandler(() => ({ artifacts: query, reader, signer }));
  const partial = await stream.GET(new NextRequest(`https://memoryai.test${body.preview.url}`, {
    headers: { range: "bytes=2-4" },
  }), tokenContext(token));
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 2-4/10");
  assert.equal(partial.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(partial.headers.get("content-disposition"), "inline; filename=review-preview.mp4");
  assert.equal(await partial.text(), "234");

  const head = await stream.HEAD(new NextRequest(`https://memoryai.test${body.preview.url}`, {
    method: "HEAD",
    headers: { range: "bytes=2-4" },
  }), tokenContext(token));
  assert.equal(head.status, 206);
  assert.equal(head.headers.get("content-length"), "3");
  assert.equal(await head.text(), "");
});

test("reviewer preview requires the existing reviewer credential and becomes unavailable after review state changes", async () => {
  const signer = new FirstPresenceReviewPreviewSigner(REVIEW_TOKEN);
  const query = { findPendingForReview: async () => null };
  const issuer = createVideoReviewPreviewAuthorizationHandler(() => ({ artifacts: query, signer }));
  const unauthorized = await issuer.GET(new NextRequest(`https://memoryai.test/api/internal/video-reviews/${JOB_ID}/preview`), context());
  assert.equal(unauthorized.status, 401);
  const unavailable = await issuer.GET(new NextRequest(`https://memoryai.test/api/internal/video-reviews/${JOB_ID}/preview`, {
    headers: reviewerHeaders(),
  }), context());
  assert.equal(unavailable.status, 404);

  const token = signer.issue({ artifact }).token;
  const stream = createVideoReviewPreviewReadHandler(() => ({ artifacts: query, reader, signer }));
  const unavailableAfterReview = await stream.GET(new NextRequest(`https://memoryai.test/api/internal/video-reviews/preview/${token}`), tokenContext(token));
  assert.equal(unavailableAfterReview.status, 404);
});
