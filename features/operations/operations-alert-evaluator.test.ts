import assert from "node:assert/strict";
import test from "node:test";

import { evaluateOperationsAlerts, OperationsAlertConfigurationError, parseOperationsAlertThresholds } from "./operations-alert-evaluator";
import type { OperationsSummary } from "./operations-postgres-datasource";

const thresholds = {
  videoActive: 10,
  videoSubmissionUncertain: 0,
  videoQualityPending: 4,
  videoManualReview: 4,
  videoTerminalP95Seconds: 120,
  commercePendingOrders: 8,
  commerceRefundsAwaitingResolution: 2,
  accountDeletionRunnableTasks: 12,
  accountDeletionFailedTasks: 0,
  chatFailedLast24Hours: 3,
  chatPendingOverFiveMinutes: 0,
};

const summary: OperationsSummary = {
  observedAt: "2026-08-02T00:00:00.000Z",
  video: { active: 10, submissionUncertain: 1, qualityPending: 3, manualReview: 4, terminalLast24Hours: 1, terminalP95Seconds: 120, committedCreditsLast24Hours: 0 },
  media: { uploadsLast24Hours: 1, uploadedBytesLast24Hours: 1 },
  commerce: { pendingOrders: 8, refundsAwaitingResolution: 1 },
  accountDeletion: { runnableTasks: 11, failedTasks: 1 },
  chat: { failedLast24Hours: 3, pendingOverFiveMinutes: 1 },
};

test("operations alert thresholds are complete, bounded and fail closed", () => {
  assert.deepEqual(parseOperationsAlertThresholds({ OPERATIONS_ALERT_THRESHOLDS_JSON: JSON.stringify(thresholds) }), thresholds);
  for (const invalid of [undefined, "", "[]", "{}", JSON.stringify({ ...thresholds, unknown: 1 }), JSON.stringify({ ...thresholds, videoActive: -1 }), JSON.stringify({ ...thresholds, videoActive: 1.5 })]) {
    assert.throws(() => parseOperationsAlertThresholds({ OPERATIONS_ALERT_THRESHOLDS_JSON: invalid }), OperationsAlertConfigurationError);
  }
});

test("operations alert evaluator reports only aggregate, deterministic threshold crossings", () => {
  const alerts = evaluateOperationsAlerts(summary, thresholds);
  assert.deepEqual(alerts, [
    { code: "VIDEO_SUBMISSION_UNCERTAIN", severity: "critical", observed: 1, threshold: 0 },
    { code: "ACCOUNT_DELETION_FAILED", severity: "critical", observed: 1, threshold: 0 },
    { code: "CHAT_PENDING_STUCK", severity: "critical", observed: 1, threshold: 0 },
    { code: "VIDEO_ACTIVE_BACKLOG", severity: "warning", observed: 10, threshold: 10 },
    { code: "VIDEO_MANUAL_REVIEW_BACKLOG", severity: "warning", observed: 4, threshold: 4 },
    { code: "VIDEO_TERMINAL_LATENCY_HIGH", severity: "warning", observed: 120, threshold: 120 },
    { code: "COMMERCE_PENDING_BACKLOG", severity: "warning", observed: 8, threshold: 8 },
    { code: "CHAT_FAILURE_RATE_HIGH", severity: "warning", observed: 3, threshold: 3 },
  ]);
  assert.doesNotMatch(JSON.stringify(alerts), /user|memory|provider|object|taskId/i);
});
