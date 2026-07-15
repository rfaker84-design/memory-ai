import { NextRequest } from "next/server";

import { legacyMutationUnavailable, legacyRouteUnavailable } from "../../../_legacy-unavailable";

export async function GET() {
  return legacyRouteUnavailable();
}

export async function POST(request: NextRequest) {
  return legacyMutationUnavailable(request);
}
