import { NextRequest } from "next/server";

import { authJson, authRouteError, verifyRequestSession } from "@/src/server/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await verifyRequestSession(request);
    if (!session) {
      return authJson({ authenticated: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return authJson({
      authenticated: true,
      user: { id: session.userId },
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    return authRouteError(error);
  }
}
