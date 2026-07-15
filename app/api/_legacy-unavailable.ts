import { NextRequest, NextResponse } from "next/server";

import { authRouteError, requireAllowedOrigin } from "@/src/server/auth";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

export function legacyRouteUnavailable(): NextResponse {
  return applyAuthNoStore(
    NextResponse.json({ error: "LEGACY_ROUTE_UNAVAILABLE" }, { status: 410 }),
  );
}

export function legacyMutationUnavailable(request: NextRequest): NextResponse {
  try {
    requireAllowedOrigin(request);
    return legacyRouteUnavailable();
  } catch (error) {
    return authRouteError(error);
  }
}
