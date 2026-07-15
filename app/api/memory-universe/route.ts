import { NextRequest } from "next/server";

import { legacyRouteUnavailable, legacyMutationUnavailable } from "../_legacy-unavailable";

export async function GET() {
  return legacyRouteUnavailable();
}

export async function PATCH(request: NextRequest) {
  return legacyMutationUnavailable(request);
}
