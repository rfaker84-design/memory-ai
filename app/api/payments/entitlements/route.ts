import { NextRequest, NextResponse } from "next/server";

import {
  PaymentPostgresDataSource,
  PaymentRepository,
  PaymentService,
  isLegacyChatCommerceTestAccount,
} from "@/features/payment";
import { AuthConfigurationError, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

export async function GET(request: NextRequest) {
  try {
    const session = await verifyRequestSession(request);
    if (!session || !isLegacyChatCommerceTestAccount(session.externalUserId)) {
      return json({ error: "LEGACY_CHAT_COMMERCE_UNAVAILABLE" }, { status: 404 });
    }
    const keys = [...request.nextUrl.searchParams.keys()];
    const memoryId = request.nextUrl.searchParams.get("memoryId")?.trim();
    if (!memoryId || keys.length !== 1 || keys[0] !== "memoryId") {
      return json({ error: "INVALID_PAYMENT_REQUEST" }, { status: 400 });
    }
    const service = new PaymentService(new PaymentRepository(new PaymentPostgresDataSource()));
    return json({ entitlements: await service.listEntitlements(session.externalUserId, memoryId) });
  } catch (error) {
    if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
    if (error instanceof AuthConfigurationError) return json({ error: "AUTH_UNAVAILABLE" }, { status: 503 });
    return json({ error: "PAYMENT_REQUEST_FAILED" }, { status: 500 });
  }
}
