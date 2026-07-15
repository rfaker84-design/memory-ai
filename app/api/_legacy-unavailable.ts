import { NextRequest, NextResponse } from "next/server";

import { authRouteError, requireAllowedOrigin } from "@/src/server/auth";

export function legacyRouteUnavailable(): NextResponse {
  return NextResponse.json({ error: "LEGACY_ROUTE_UNAVAILABLE" }, { status: 410 });
}

export function legacyMutationUnavailable(request: NextRequest): NextResponse {
  try {
    requireAllowedOrigin(request);
    return legacyRouteUnavailable();
  } catch (error) {
    return authRouteError(error);
  }
}
