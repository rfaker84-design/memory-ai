import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  OperationsPostgresDataSource,
  type OperationsSummary,
} from "@/features/operations";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const TOKEN_HEADER = "x-operations-metrics-token";
type SummaryReader = Pick<OperationsPostgresDataSource, "summary">;

function authorized(request: NextRequest): "ok" | "unconfigured" | "denied" {
  const expected = process.env.OPERATIONS_METRICS_ACCESS_TOKEN;
  const supplied = request.headers.get(TOKEN_HEADER);
  if (!expected || expected !== expected.trim() || Buffer.byteLength(expected, "utf8") < 32) return "unconfigured";
  if (!supplied) return "denied";
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right) ? "ok" : "denied";
}

const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

export function createOperationsSummaryHandler(
  readerFactory: () => SummaryReader = () => new OperationsPostgresDataSource(),
) {
  return async function GET(request: NextRequest) {
    if ([...request.nextUrl.searchParams.keys()].length > 0) {
      return json({ error: "INVALID_OPERATIONS_SUMMARY_REQUEST" }, { status: 400 });
    }
    const access = authorized(request);
    if (access === "unconfigured") {
      return json({ error: "OPERATIONS_METRICS_UNAVAILABLE" }, { status: 503 });
    }
    if (access === "denied") {
      return json({ error: "OPERATIONS_METRICS_UNAUTHORIZED" }, { status: 401 });
    }
    try {
      const summary: OperationsSummary = await readerFactory().summary();
      return json({ summary });
    } catch (error) {
      if (error instanceof DatabaseDependencyError) {
        return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
      }
      console.error("[api:internal:operations-summary] aggregate query failed");
      return json({ error: "OPERATIONS_METRICS_UNAVAILABLE" }, { status: 503 });
    }
  };
}
