import { NextRequest, NextResponse } from "next/server";

import {
  CommercePostgresDataSource,
  CommerceRepository,
  CommerceService,
} from "@/features/commerce";
import {
  AuthConfigurationError,
  verifyRequestSession,
} from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

export async function GET(request: NextRequest) {
  try {
    const session = await verifyRequestSession(request);
    if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
    if ([...request.nextUrl.searchParams.keys()].length > 0) {
      return json({ error: "INVALID_COMMERCE_REQUEST" }, { status: 400 });
    }
    const service = new CommerceService(
      new CommerceRepository(new CommercePostgresDataSource()),
    );
    return json({
      balance: await service.getCreditBalance(session.externalUserId),
    });
  } catch (error) {
    if (
      error instanceof AuthConfigurationError
      || error instanceof DatabaseDependencyError
    ) {
      return json({ error: "COMMERCE_BALANCE_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[api:commerce:credits] request failed");
    return json({ error: "COMMERCE_BALANCE_UNAVAILABLE" }, { status: 503 });
  }
}
