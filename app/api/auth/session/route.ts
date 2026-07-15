import { NextRequest, NextResponse } from "next/server";

import { authRouteError, verifyRequestSession } from "@/src/server/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await verifyRequestSession(request);
    if (!session) {
      return NextResponse.json({ authenticated: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.json({
      authenticated: true,
      user: { id: session.userId },
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    return authRouteError(error);
  }
}
