import type { OperationsSummary } from "./operations-postgres-datasource";

export type OperationsAlertThresholds = {
  videoActive: number;
  videoSubmissionUncertain: number;
  videoQualityPending: number;
  videoManualReview: number;
  videoTerminalP95Seconds: number;
  videoCommittedCreditsLast24Hours: number;
  commercePendingOrders: number;
  commerceRefundsAwaitingResolution: number;
  accountDeletionRunnableTasks: number;
  accountDeletionFailedTasks: number;
  chatFailedLast24Hours: number;
  chatPendingOverFiveMinutes: number;
};

export type OperationsAlert = {
  code:
    | "VIDEO_ACTIVE_BACKLOG"
    | "VIDEO_SUBMISSION_UNCERTAIN"
    | "VIDEO_QUALITY_BACKLOG"
    | "VIDEO_MANUAL_REVIEW_BACKLOG"
    | "VIDEO_TERMINAL_LATENCY_HIGH"
    | "VIDEO_COMMITTED_CREDITS_HIGH"
    | "COMMERCE_PENDING_BACKLOG"
    | "COMMERCE_REFUND_BACKLOG"
    | "ACCOUNT_DELETION_BACKLOG"
    | "ACCOUNT_DELETION_FAILED"
    | "CHAT_FAILURE_RATE_HIGH"
    | "CHAT_PENDING_STUCK";
  severity: "warning" | "critical";
  observed: number;
  threshold: number;
};

const keys = [
  "videoActive",
  "videoSubmissionUncertain",
  "videoQualityPending",
  "videoManualReview",
  "videoTerminalP95Seconds",
  "videoCommittedCreditsLast24Hours",
  "commercePendingOrders",
  "commerceRefundsAwaitingResolution",
  "accountDeletionRunnableTasks",
  "accountDeletionFailedTasks",
  "chatFailedLast24Hours",
  "chatPendingOverFiveMinutes",
] as const satisfies ReadonlyArray<keyof OperationsAlertThresholds>;

export class OperationsAlertConfigurationError extends Error {
  constructor() {
    super("OPERATIONS_ALERT_THRESHOLDS_INVALID");
    this.name = "OperationsAlertConfigurationError";
  }
}

/**
 * A deployment-owned JSON document is deliberate: all thresholds must be
 * explicit, and a typo or partial configuration must not silently disable an
 * alert. It contains only bounded numbers and never any user/provider data.
 */
export function parseOperationsAlertThresholds(environment: Readonly<Record<string, string | undefined>> = process.env): OperationsAlertThresholds {
  const raw = environment.OPERATIONS_ALERT_THRESHOLDS_JSON;
  if (!raw || raw !== raw.trim()) throw new OperationsAlertConfigurationError();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new OperationsAlertConfigurationError(); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OperationsAlertConfigurationError();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || Object.keys(record).some((key) => !keys.includes(key as keyof OperationsAlertThresholds))) {
    throw new OperationsAlertConfigurationError();
  }
  for (const key of keys) {
    const threshold = record[key];
    if (typeof threshold !== "number" || !Number.isSafeInteger(threshold) || threshold < 0) {
      throw new OperationsAlertConfigurationError();
    }
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, record[key]])) as OperationsAlertThresholds);
}

function above(observed: number, threshold: number): boolean {
  return observed >= threshold && (threshold !== 0 || observed > 0);
}

/** Returns aggregate-only alert facts in deterministic severity/code order. */
export function evaluateOperationsAlerts(summary: OperationsSummary, thresholds: OperationsAlertThresholds): OperationsAlert[] {
  const checks: Array<OperationsAlert> = [
    { code: "VIDEO_SUBMISSION_UNCERTAIN", severity: "critical", observed: summary.video.submissionUncertain, threshold: thresholds.videoSubmissionUncertain },
    { code: "ACCOUNT_DELETION_FAILED", severity: "critical", observed: summary.accountDeletion.failedTasks, threshold: thresholds.accountDeletionFailedTasks },
    { code: "CHAT_PENDING_STUCK", severity: "critical", observed: summary.chat.pendingOverFiveMinutes, threshold: thresholds.chatPendingOverFiveMinutes },
    { code: "VIDEO_ACTIVE_BACKLOG", severity: "warning", observed: summary.video.active, threshold: thresholds.videoActive },
    { code: "VIDEO_QUALITY_BACKLOG", severity: "warning", observed: summary.video.qualityPending, threshold: thresholds.videoQualityPending },
    { code: "VIDEO_MANUAL_REVIEW_BACKLOG", severity: "warning", observed: summary.video.manualReview, threshold: thresholds.videoManualReview },
    { code: "VIDEO_TERMINAL_LATENCY_HIGH", severity: "warning", observed: summary.video.terminalP95Seconds, threshold: thresholds.videoTerminalP95Seconds },
    { code: "VIDEO_COMMITTED_CREDITS_HIGH", severity: "warning", observed: summary.video.committedCreditsLast24Hours, threshold: thresholds.videoCommittedCreditsLast24Hours },
    { code: "COMMERCE_PENDING_BACKLOG", severity: "warning", observed: summary.commerce.pendingOrders, threshold: thresholds.commercePendingOrders },
    { code: "COMMERCE_REFUND_BACKLOG", severity: "warning", observed: summary.commerce.refundsAwaitingResolution, threshold: thresholds.commerceRefundsAwaitingResolution },
    { code: "ACCOUNT_DELETION_BACKLOG", severity: "warning", observed: summary.accountDeletion.runnableTasks, threshold: thresholds.accountDeletionRunnableTasks },
    { code: "CHAT_FAILURE_RATE_HIGH", severity: "warning", observed: summary.chat.failedLast24Hours, threshold: thresholds.chatFailedLast24Hours },
  ];
  return checks.filter((alert) => above(alert.observed, alert.threshold));
}
