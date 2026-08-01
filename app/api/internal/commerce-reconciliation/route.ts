import { NextRequest, NextResponse } from "next/server";

import {
  CommercePostgresDataSource,
  CommerceRepository,
  CommerceService,
} from "@/features/commerce";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import { hasValidInternalAccessToken } from "@/src/server/security/internal-access-token";

const TOKEN_HEADER = "x-commerce-reconciliation-access-token";
const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

function authorized(request: NextRequest): boolean {
  return hasValidInternalAccessToken({
    candidate: request.headers.get(TOKEN_HEADER),
    currentName: "COMMERCE_RECONCILIATION_ACCESS_TOKEN",
    minimumBytes: 48,
  });
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
