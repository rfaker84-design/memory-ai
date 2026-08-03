import { performance } from "node:perf_hooks";

import {
  CapacityBaselinePlanError,
  parseCapacityBaselinePlan,
  type CapacityBaselinePlan,
} from "./capacity-baseline-contract";

type FetchLike = (input: URL | string, init?: RequestInit) => Promise<Response>;

export type CapacityBaselineMeasurement = Readonly<{
  kind: "memoryai.capacity-baseline";
  targetEnvironment: "isolated";
  endpoint: "/api/health";
  requests: number;
  concurrency: number;
  successfulResponses: number;
  failedResponses: number;
  timeoutCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxInFlight: number;
  providerSubmitCount: 0;
  expectedExternalCost: 0;
}>;

export class CapacityBaselineRunError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CapacityBaselineRunError";
  }
}

function healthEndpoint(plan: CapacityBaselinePlan): URL {
  if (plan.targetEnvironment !== "isolated") {
    throw new CapacityBaselineRunError("CAPACITY_STAGING_EXECUTION_NOT_ALLOWED");
  }
  return new URL("/api/health", plan.targetUrl);
}

function percentile(values: readonly number[], percentileValue: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * percentileValue) - 1)] ?? 0;
}

function isHealthResponse(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.status === "ok" && record.service === "MemoryAI" && typeof record.time === "string";
}

/**
 * Executes only a bounded, loopback health-read workload. It does not create
 * a user, upload media, start a worker, or invoke any external Provider.
 */
export async function runCapacityBaseline(
  input: unknown,
  fetcher: FetchLike = fetch,
  timeoutMs = 5_000,
): Promise<CapacityBaselineMeasurement> {
  const plan = parseCapacityBaselinePlan(input);
  const endpoint = healthEndpoint(plan);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new CapacityBaselineRunError("CAPACITY_TIMEOUT_INVALID");
  }

  const latencies: number[] = [];
  let nextRequest = 0;
  let successfulResponses = 0;
  let failedResponses = 0;
  let timeoutCount = 0;
  let inFlight = 0;
  let maxInFlight = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentRequest = nextRequest;
      nextRequest += 1;
      if (currentRequest >= plan.requests) return;

      const startedAt = performance.now();
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        const response = await fetcher(endpoint, {
          method: "GET",
          headers: { accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok || !isHealthResponse(await response.json())) {
          failedResponses += 1;
        } else {
          successfulResponses += 1;
        }
      } catch (error) {
        failedResponses += 1;
        if (error instanceof DOMException && error.name === "TimeoutError") timeoutCount += 1;
      } finally {
        latencies.push(performance.now() - startedAt);
        inFlight -= 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(plan.concurrency, plan.requests) }, () => worker()));
  if (failedResponses > 0) throw new CapacityBaselineRunError("CAPACITY_HEALTH_REQUEST_FAILED");

  return Object.freeze({
    kind: "memoryai.capacity-baseline",
    targetEnvironment: "isolated",
    endpoint: "/api/health",
    requests: plan.requests,
    concurrency: plan.concurrency,
    successfulResponses,
    failedResponses,
    timeoutCount,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    maxInFlight,
    providerSubmitCount: 0,
    expectedExternalCost: 0,
  });
}

async function main(): Promise<void> {
  try {
    const rawPlan = process.argv[2];
    if (!rawPlan) throw new CapacityBaselineRunError("CAPACITY_PLAN_ARGUMENT_REQUIRED");
    const result = await runCapacityBaseline(JSON.parse(rawPlan));
    console.log(JSON.stringify(result));
  } catch (error) {
    const code = error instanceof CapacityBaselinePlanError || error instanceof CapacityBaselineRunError
      ? error.code
      : "CAPACITY_RUNNER_FAILED";
    console.error(JSON.stringify({ kind: "memoryai.capacity-baseline.error", code }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  void main();
}
