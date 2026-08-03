import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createReportReviewsHandler, validateReportReview } from "./_handler";

const reportId = "550e8400-e29b-41d4-a716-446655440000";
const token = "report-review-test-token-0123456789abcdefghijklmnopqrstuvwxyz";
const reviewer = "report-reviewer@yijian.test";

test("report-review payload validation requires an explicit content action", () => {
  assert.deepEqual(validateReportReview({ reportId, status: "triaged", disposition: "Rights review required.", contentAction: "none" }), {
    input: { reportId, status: "triaged", disposition: "Rights review required.", contentAction: "none" },
  });
  assert.deepEqual(validateReportReview({ reportId, status: "triaged", disposition: "ok", reviewer: "forged", contentAction: "none" }), { error: "keys" });
  assert.deepEqual(validateReportReview({ reportId: "not-a-uuid", status: "triaged", disposition: "ok", contentAction: "none" }), { error: "id" });
  assert.deepEqual(validateReportReview({ reportId, status: "triaged", disposition: "ok", contentAction: "hide" }), { error: "content_action" });
});

test("report-review disposition requires explicit internal authorization", async () => {
  const previous = {
    enabled: process.env.YIJIAN_REPORT_REVIEW_INTERNAL_ENABLED,
    token: process.env.REPORT_REVIEW_ACCESS_TOKEN,
    account: process.env.REPORT_REVIEW_ACCOUNT,
  };
  try {
    process.env.YIJIAN_REPORT_REVIEW_INTERNAL_ENABLED = "true";
    process.env.REPORT_REVIEW_ACCESS_TOKEN = token;
    process.env.REPORT_REVIEW_ACCOUNT = reviewer;
    let received: unknown;
    const handler = createReportReviewsHandler({ dispose: async (input) => {
      received = input;
      return { id: input.reportId, status: input.status } as never;
    } });
    const unauthorized = await handler(new NextRequest("https://memoryai.test/api/internal/report-reviews", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId, status: "triaged", disposition: "ok", contentAction: "none" }),
    }));
    assert.equal(unauthorized.status, 401);
    const approved = await handler(new NextRequest("https://memoryai.test/api/internal/report-reviews", {
      method: "POST",
      headers: { "content-type": "application/json", "x-report-review-access-token": token, "x-report-reviewer-account": reviewer },
      body: JSON.stringify({ reportId, status: "triaged", disposition: "Rights review required.", contentAction: "none" }),
    }));
    assert.equal(approved.status, 200);
    assert.deepEqual(received, { reportId, status: "triaged", disposition: "Rights review required.", contentAction: "none", reviewer });
  } finally {
    if (previous.enabled === undefined) delete process.env.YIJIAN_REPORT_REVIEW_INTERNAL_ENABLED; else process.env.YIJIAN_REPORT_REVIEW_INTERNAL_ENABLED = previous.enabled;
    if (previous.token === undefined) delete process.env.REPORT_REVIEW_ACCESS_TOKEN; else process.env.REPORT_REVIEW_ACCESS_TOKEN = previous.token;
    if (previous.account === undefined) delete process.env.REPORT_REVIEW_ACCOUNT; else process.env.REPORT_REVIEW_ACCOUNT = previous.account;
  }
});
