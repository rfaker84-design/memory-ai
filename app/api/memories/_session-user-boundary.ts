import { NextRequest, NextResponse } from "next/server";

import {
  type AuthSession,
  verifyRequestSession,
} from "@/src/server/auth";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

export type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;

export type SessionOwnerBoundary =
  | { externalUserId: string; session: AuthSession }
  | { response: NextResponse };

export async function resolveSessionOwner(
  request: NextRequest,
  compatibilityUserId?: unknown,
  sessionResolver: SessionResolver = verifyRequestSession
): Promise<SessionOwnerBoundary> {
  const session = await sessionResolver(request);
  if (!session) {
    return {
      response: applyAuthNoStore(NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 })),
    };
  }

  if (
    compatibilityUserId !== undefined
    && (typeof compatibilityUserId !== "string"
      || compatibilityUserId.trim() !== session.externalUserId)
  ) {
    return {
      response: applyAuthNoStore(NextResponse.json({ error: "SESSION_USER_MISMATCH" }, { status: 403 })),
    };
  }

  return { externalUserId: session.externalUserId, session };
}
