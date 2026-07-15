import { NextRequest } from "next/server";

import {
  authRouteError,
  authJson,
  clearSessionCookie,
  requireAllowedOrigin,
} from "@/src/server/auth";

export async function POST(request: NextRequest) {
  try {
    requireAllowedOrigin(request);
    const response = authJson({ authenticated: false });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return authRouteError(error);
  }
}
