import { NextRequest } from "next/server";

import { legacyMutationUnavailable } from "../../_legacy-unavailable";

export async function POST(request: NextRequest) {
  return legacyMutationUnavailable(request);
}
