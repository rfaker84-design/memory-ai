import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  CommercePostgresDataSource,
  CommerceRepository,
  CommerceService,
} from "@/features/commerce";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const TOKEN_HEADER = "x-commerce-reconciliation-access-token";
const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

function authorized(request: NextRequest): boolean {
  const expected = process.env.COMMERCE_RECONCILIATION_ACCESS_TOKEN;
  const supplied = request.headers.get(TOKEN_HEADER);
  if (
    !expected
    || expected !== expected.trim()
    || Buffer.byteLength(expected, "utf8") < 48
    || !supplied
  ) {
    return false;
  }
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return json({ error: "RECONCILIATION_UNAUTHORIZED" }, { status: 401 });
  }
  if ([...request.nextUrl.searchParams.keys()].length > 0) {
    return json({ error: "INVALID_RECONCILIATION_REQUEST" }, { status: 400 });
  }
  try {
    const service = new CommerceService(
      new CommerceRepository(new CommercePostgresDataSource()),
    );
    return json({ report: await service.reconcileOrders() });
  } catch {
    return json({ error: "RECONCILIATION_UNAVAILABLE" }, { status: 503 });
  }
}
