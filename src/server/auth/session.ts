import { jwtVerify, SignJWT } from "jose";
import type { NextRequest, NextResponse } from "next/server";

import {
  AUTH_POLICY,
  AUTH_SESSION_AUDIENCE,
  AUTH_SESSION_COOKIE,
  AUTH_SESSION_ISSUER,
} from "./config";
import { sessionSecret } from "./crypto";
import { AuthConfigurationError } from "./crypto";

export type AuthSession = {
  userId: string;
  externalUserId: string;
  expiresAt: string;
};

export async function issueSession(input: {
  userId: string;
  externalUserId: string;
  now?: Date;
}): Promise<string> {
  const now = input.now ?? new Date();
  return new SignJWT({ externalUserId: input.externalUserId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuer(AUTH_SESSION_ISSUER)
    .setAudience(AUTH_SESSION_AUDIENCE)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + AUTH_POLICY.sessionTtlSeconds)
    .sign(sessionSecret());
}

export async function verifySessionToken(token: string): Promise<AuthSession | null> {
  try {
    const verified = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
      issuer: AUTH_SESSION_ISSUER,
      audience: AUTH_SESSION_AUDIENCE,
    });
    if (!verified.payload.sub || typeof verified.payload.externalUserId !== "string" || !verified.payload.exp) {
      return null;
    }
    return {
      userId: verified.payload.sub,
      externalUserId: verified.payload.externalUserId,
      expiresAt: new Date(verified.payload.exp * 1000).toISOString(),
    };
  } catch (error) {
    if (error instanceof AuthConfigurationError) throw error;
    return null;
  }
}

export async function verifyRequestSession(request: NextRequest): Promise<AuthSession | null> {
  const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: AUTH_SESSION_COOKIE,
    value: token,
    secure: true,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_POLICY.sessionTtlSeconds,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: AUTH_SESSION_COOKIE,
    value: "",
    secure: true,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
