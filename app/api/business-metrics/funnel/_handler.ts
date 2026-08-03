import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { BusinessMetricsPostgresDataSource } from "@/features/business-metrics";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type FunnelReader = Pick<BusinessMetricsPostgresDataSource, "funnelReport">;

function authorized(request: NextRequest): boolean {
  const expected = process.env.BUSINESS_METRICS_ACCESS_TOKEN;
  const supplied = request.headers.get("x-business-metrics-token");
  if (!expected || expected !== expected.trim() || Buffer.byteLength(expected, "utf8") < 32 || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseDay(value: string | null, end = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export function createBusinessFunnelHandler(readerFactory: () => FunnelReader = () => new BusinessMetricsPostgresDataSource()) {
  return async function GET(request: NextRequest) {
    if (!authorized(request)) return applyAuthNoStore(NextResponse.json({ error: "BUSINESS_METRICS_UNAUTHORIZED" }, { status: 401 }));
    const query = request.nextUrl.searchParams;
    if ([...query.keys()].some((key) => key !== "from" && key !== "to")) return applyAuthNoStore(NextResponse.json({ error: "INVALID_TIME_RANGE" }, { status: 400 }));
    const requestedFrom = query.get("from");
    const requestedTo = query.get("to");
    const parsedFrom = requestedFrom ? parseDay(requestedFrom) : null;
    const parsedTo = requestedTo ? parseDay(requestedTo, true) : null;
    if ((requestedFrom && !parsedFrom) || (requestedTo && !parsedTo)) {
      return applyAuthNoStore(NextResponse.json({ error: "INVALID_TIME_RANGE" }, { status: 400 }));
    }
    const now = new Date();
    const to = parsedTo ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const from = parsedFrom ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    try {
      return applyAuthNoStore(NextResponse.json(await readerFactory().funnelReport(from, to)));
    } catch (error) {
      if ((error as Error).message === "INVALID_TIME_RANGE") return applyAuthNoStore(NextResponse.json({ error: "INVALID_TIME_RANGE" }, { status: 400 }));
      if (error instanceof DatabaseDependencyError) return applyAuthNoStore(NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 }));
      console.error("[api:business-metrics] aggregate query failed");
      return applyAuthNoStore(NextResponse.json({ error: "BUSINESS_METRICS_UNAVAILABLE" }, { status: 503 }));
    }
  };
}
