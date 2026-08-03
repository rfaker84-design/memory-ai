import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createOperationsAlertsHandler } from "./_handler";

const token = "o".repeat(32);
const thresholds = JSON.stringify({
  videoActive: 2, videoSubmissionUncertain: 0, videoQualityPending: 2, videoManualReview: 2,
  videoTerminalP95Seconds: 60, videoCommittedCreditsLast24Hours: 50, commercePendingOrders: 2, commerceRefundsAwaitingResolution: 2,
  accountDeletionRunnableTasks: 2, accountDeletionFailedTasks: 0,
  chatFailedLast24Hours: 2, chatPendingOverFiveMinutes: 0,
});
const summary = {
  observedAt: "2026-08-02T00:00:00.000Z",
  video: { active: 0, submissionUncertain: 1, qualityPending: 0, manualReview: 0, terminalLast24Hours: 0, terminalP95Seconds: 0, committedCreditsLast24Hours: 0 },
  media: { uploadsLast24Hours: 0, uploadedBytesLast24Hours: 0 },
  commerce: { pendingOrders: 0, refundsAwaitingResolution: 0 },
  accountDeletion: { runnableTasks: 0, failedTasks: 0 },
  chat: { failedLast24Hours: 0, pendingOverFiveMinutes: 0 },
};

function request(headers?: Record<string, string>) {
  return new NextRequest("https://memoryai.test/api/internal/operations/alerts", { headers });
}

test("operations alerts require the internal token and return aggregate-only alert facts", async () => {
  const prior = process.env.OPERATIONS_METRICS_ACCESS_TOKEN;
  process.env.OPERATIONS_METRICS_ACCESS_TOKEN = token;
  try {
    const handler = createOperationsAlertsHandler(() => ({ summary: async () => summary }), { OPERATIONS_ALERT_THRESHOLDS_JSON: thresholds });
    assert.equal((await handler(request())).status, 401);
    const response = await handler(request({ "x-operations-metrics-token": token }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      observedAt: summary.observedAt,
      alerts: [{ code: "VIDEO_SUBMISSION_UNCERTAIN", severity: "critical", observed: 1, threshold: 0 }],
    });
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  } finally { process.env.OPERATIONS_METRICS_ACCESS_TOKEN = prior; }
});

test("operations alerts fail closed for threshold configuration and query strings", async () => {
  const prior = process.env.OPERATIONS_METRICS_ACCESS_TOKEN;
  process.env.OPERATIONS_METRICS_ACCESS_TOKEN = token;
  try {
    const unavailable = await createOperationsAlertsHandler(() => ({ summary: async () => summary }), {})(request({ "x-operations-metrics-token": token }));
    assert.equal(unavailable.status, 503);
    const invalid = await createOperationsAlertsHandler(() => ({ summary: async () => summary }), { OPERATIONS_ALERT_THRESHOLDS_JSON: thresholds })(new NextRequest("https://memoryai.test/api/internal/operations/alerts?userId=private", { headers: { "x-operations-metrics-token": token } }));
    assert.equal(invalid.status, 400);
  } finally { process.env.OPERATIONS_METRICS_ACCESS_TOKEN = prior; }
});
