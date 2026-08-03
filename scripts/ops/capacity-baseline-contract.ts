/**
 * Validates the non-secret plan that a future deployment-owned capacity runner
 * must accept before it can send any traffic. This module deliberately does
 * not make network requests or start workers.
 */

export type CapacityBaselinePlan = Readonly<{
  targetUrl: URL;
  targetEnvironment: "isolated" | "staging";
  approvedChangeId: string | null;
  syntheticDataOnly: true;
  providerSubmit: false;
  requests: number;
  concurrency: number;
  uploadBytes: number;
}>;

export class CapacityBaselinePlanError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CapacityBaselinePlanError";
  }
}

const PLAN_KEYS = new Set([
  "targetUrl",
  "targetEnvironment",
  "approvedChangeId",
  "syntheticDataOnly",
  "providerSubmit",
  "requests",
  "concurrency",
  "uploadBytes",
]);

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value === value.trim() && value.length > 0 ? value : null;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function targetUrl(value: unknown): URL {
  const raw = nonEmptyText(value);
  if (!raw) throw new CapacityBaselinePlanError("CAPACITY_TARGET_INVALID");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CapacityBaselinePlanError("CAPACITY_TARGET_INVALID");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  ) {
    throw new CapacityBaselinePlanError("CAPACITY_TARGET_INVALID");
  }
  if (url.hostname === "yijianmemory.cn" || url.hostname.endsWith(".yijianmemory.cn")) {
    throw new CapacityBaselinePlanError("CAPACITY_PRODUCTION_FORBIDDEN");
  }
  return url;
}

/**
 * The plan must remain harmless by construction: capacity work is synthetic,
 * cannot submit a Provider job, and can never target production. Staging needs
 * a separately recorded approval identifier before any runner may use it.
 */
export function parseCapacityBaselinePlan(value: unknown): CapacityBaselinePlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CapacityBaselinePlanError("CAPACITY_PLAN_INVALID");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== PLAN_KEYS.size || Object.keys(record).some((key) => !PLAN_KEYS.has(key))) {
    throw new CapacityBaselinePlanError("CAPACITY_PLAN_INVALID");
  }
  const environment = record.targetEnvironment;
  if (environment !== "isolated" && environment !== "staging") throw new CapacityBaselinePlanError("CAPACITY_ENVIRONMENT_INVALID");
  if (record.syntheticDataOnly !== true || record.providerSubmit !== false) throw new CapacityBaselinePlanError("CAPACITY_SIDE_EFFECT_FORBIDDEN");

  const changeId = record.approvedChangeId === null ? null : nonEmptyText(record.approvedChangeId);
  if (record.approvedChangeId !== null && !changeId) throw new CapacityBaselinePlanError("CAPACITY_APPROVAL_INVALID");
  if (environment === "staging" && !changeId) throw new CapacityBaselinePlanError("CAPACITY_STAGING_APPROVAL_REQUIRED");

  const requests = boundedInteger(record.requests, 1, 10_000);
  const concurrency = boundedInteger(record.concurrency, 1, 100);
  const uploadBytes = boundedInteger(record.uploadBytes, 1, 20 * 1024 * 1024);
  if (!requests || !concurrency || !uploadBytes || concurrency > requests) throw new CapacityBaselinePlanError("CAPACITY_WORKLOAD_INVALID");

  return Object.freeze({
    targetUrl: targetUrl(record.targetUrl),
    targetEnvironment: environment,
    approvedChangeId: changeId,
    syntheticDataOnly: true,
    providerSubmit: false,
    requests,
    concurrency,
    uploadBytes,
  });
}
