import { NextRequest } from "next/server";

import { legacyRouteUnavailable, legacyMutationUnavailable } from "../_legacy-unavailable";

export async function GET() {
  return legacyRouteUnavailable();
}

export async function POST(request: NextRequest) {
  return legacyMutationUnavailable(request);
}
