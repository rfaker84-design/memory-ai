import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createOperationsSummaryHandler } from "./summary/_handler";
import { createOperationsAlertsHandler } from "./alerts/_handler";

const token = "operations-route-test-token-at-least-32-bytes";
const summary = {
  observedAt: "2026-08-02T00:00:00.000Z",
  media: { uploadsLast24Hours: 0, uploadedBytesLast24Hours: 0 },
  video: { active: 0, qualityPending: 0, manualReview: 0, submissionUncertain: 0, terminalLast24Hours: 0, terminalP95Seconds: 0, committedCreditsLast24Hours: 0 },
  commerce: { pendingOrders: 0, refundsAwaitingResolution: 0 },
  accountDeletion: { runnableTasks: 0, failedTasks: 0 },
  chat: { pendingOverFiveMinutes: 0, failedLast24Hours: 0 },
};

function request(path: string, supplied?: string): NextRequest {
  return new NextRequest(`https://memoryai.test${path}`, { headers: supplied ? { "x-operations-metrics-token": supplied } : {} });
}

test("operations summary and alerts reject query strings and unauthenticated reads before aggregation", async () => {
  const previous = process.env.OPERATIONS_METRICS_ACCESS_TOKEN;
  process.env.OPERATIONS_METRICS_ACCESS_TOKEN = token;
  let calls = 0;
  const reader = () => ({ summary: async () => { calls += 1; return summary; } });
  const summaryHandler = createOperationsSummaryHandler(reader);
  const alertsHandler = createOperationsAlertsHandler(reader, {
    OPERATIONS_ALERTS_VIDEO_ACTIVE_THRESHOLD: "1",
    OPERATIONS_ALERTS_VIDEO_QUALITY_PENDING_THRESHOLD: "1",
    OPERATIONS_ALERTS_VIDEO_MANUAL_REVIEW_THRESHOLD: "1",
    OPERATIONS_ALERTS_VIDEO_SUBMISSION_UNCERTAIN_THRESHOLD: "0",
    OPERATIONS_ALERTS_VIDEO_TERMINAL_P95_SECONDS_THRESHOLD: "1",
    OPERATIONS_ALERTS_COMMERCE_PENDING_ORDERS_THRESHOLD: "1",
    OPERATIONS_ALERTS_COMMERCE_REFUNDS_THRESHOLD: "1",
    OPERATIONS_ALERTS_ACCOUNT_DELETION_RUNNABLE_THRESHOLD: "1",
    OPERATIONS_ALERTS_ACCOUNT_DELETION_FAILED_THRESHOLD: "0",
    OPERATIONS_ALERTS_CHAT_PENDING_OVER_FIVE_MINUTES_THRESHOLD: "0",
    OPERATIONS_ALERTS_CHAT_FAILED_LAST_24_HOURS_THRESHOLD: "1",
  });
  try {
    assert.equal((await summaryHandler(request("/api/internal/operations/summary?x=1", token))).status, 400);
    assert.equal((await alertsHandler(request("/api/internal/operations/alerts?x=1", token))).status, 400);
    assert.equal((await summaryHandler(request("/api/internal/operations/summary", "wrong"))).status, 401);
    assert.equal((await alertsHandler(request("/api/internal/operations/alerts", "wrong"))).status, 401);
    assert.equal(calls, 0);
    const response = await summaryHandler(request("/api/internal/operations/summary", token));
    assert.equal(response.status, 200);
    assert.doesNotMatch(JSON.stringify(await response.json()), /user|memory|provider|object|taskId/i);
  } finally {
    if (previous === undefined) delete process.env.OPERATIONS_METRICS_ACCESS_TOKEN;
    else process.env.OPERATIONS_METRICS_ACCESS_TOKEN = previous;
  }
});
