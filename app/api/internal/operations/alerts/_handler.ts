import { NextRequest, NextResponse } from "next/server";

import {
  evaluateOperationsAlerts,
  OperationsAlertConfigurationError,
  OperationsPostgresDataSource,
  parseOperationsAlertThresholds,
  type OperationsSummary,
} from "@/features/operations";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import { hasValidInternalAccessToken } from "@/src/server/security/internal-access-token";

const TOKEN_HEADER = "x-operations-metrics-token";
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));
type SummaryReader = Pick<OperationsPostgresDataSource, "summary">;

function authorized(request: NextRequest): boolean {
  const supplied = request.headers.get(TOKEN_HEADER);
  return hasValidInternalAccessToken({
    candidate: supplied,
    currentName: "OPERATIONS_METRICS_ACCESS_TOKEN",
    minimumBytes: 32,
  });
}

/** A pull endpoint for a deployment-owned collector; it never dispatches a webhook. */
export function createOperationsAlertsHandler(
  readerFactory: () => Pick<SummaryReader, "summary"> = () => new OperationsPostgresDataSource(),
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return async function GET(request: NextRequest) {
    if ([...request.nextUrl.searchParams.keys()].length > 0) return json({ error: "INVALID_OPERATIONS_ALERTS_REQUEST" }, { status: 400 });
    if (!authorized(request)) return json({ error: "OPERATIONS_ALERTS_UNAUTHORIZED" }, { status: 401 });
    try {
      const summary: OperationsSummary = await readerFactory().summary();
      const thresholds = parseOperationsAlertThresholds(environment);
      return json({ observedAt: summary.observedAt, alerts: evaluateOperationsAlerts(summary, thresholds) });
    } catch (error) {
      if (error instanceof OperationsAlertConfigurationError) return json({ error: "OPERATIONS_ALERTS_UNAVAILABLE" }, { status: 503 });
      if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
      console.error("[api:internal:operations-alerts] aggregate evaluation failed");
      return json({ error: "OPERATIONS_ALERTS_UNAVAILABLE" }, { status: 503 });
    }
  };
}
