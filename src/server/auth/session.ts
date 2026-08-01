import { randomUUID } from "node:crypto";

import { decodeProtectedHeader, jwtVerify, SignJWT } from "jose";
import type { JWTVerifyResult } from "jose";
import type { NextRequest, NextResponse } from "next/server";

import {
  AUTH_POLICY,
  AUTH_SESSION_AUDIENCE,
  AUTH_SESSION_COOKIE,
  AUTH_SESSION_ISSUER,
} from "./config";
import { queryPostgres } from "../database/postgres";
import { AuthConfigurationError, sessionSigningKeyRing, verificationPepperKeyRing } from "./crypto";
import { isSessionRevoked } from "./session-revocation";

export type AuthSession = {
  userId: string;
  externalUserId: string;
  /** Present for JWT-backed sessions; injected test and legacy adapters may omit it. */
  authenticatedAt?: string;
  expiresAt: string;
};

type SessionRevocationLookup = (input: { jti: string; userId: string; issuedAt: string }) => Promise<boolean>;
type SessionExternalUserIdLookup = (input: { userId: string; externalUserId: string }) => Promise<string | null>;

function hasVerificationPepperOverlapConfiguration(environment: NodeJS.ProcessEnv = process.env): boolean {
  return [
    environment.AUTH_VERIFICATION_PEPPER_PREVIOUS,
    environment.AUTH_VERIFICATION_PEPPER_PREVIOUS_KID,
    environment.AUTH_VERIFICATION_PEPPER_PREVIOUS_VALID_UNTIL,
  ].some((value) => value !== undefined && value !== "");
}

async function resolveCanonicalExternalUserId(input: { userId: string; externalUserId: string }): Promise<string | null> {
  const result = await queryPostgres<{ external_id: string }>(
    "SELECT external_id FROM public.users WHERE id=$1::uuid",
    [input.userId],
  );
  return result.rows[0]?.external_id ?? null;
}

export async function issueSession(input: {
  userId: string;
  externalUserId: string;
  now?: Date;
}): Promise<string> {
  const now = input.now ?? new Date();
  const keyRing = sessionSigningKeyRing();
  return new SignJWT({ externalUserId: input.externalUserId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: keyRing.current.id })
    .setSubject(input.userId)
    .setIssuer(AUTH_SESSION_ISSUER)
    .setAudience(AUTH_SESSION_AUDIENCE)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + AUTH_POLICY.sessionTtlSeconds)
    .setJti(randomUUID())
    .sign(keyRing.current.secret);
}

export async function verifySessionToken(
  token: string,
  revoked: SessionRevocationLookup = isSessionRevoked,
  resolveExternalUserId: SessionExternalUserIdLookup = resolveCanonicalExternalUserId,
): Promise<AuthSession | null> {
  try {
    const keyRing = sessionSigningKeyRing();
    const protectedHeader = decodeProtectedHeader(token);
    const keys = protectedHeader.kid === undefined
      ? [keyRing.current, ...(keyRing.previous ? [keyRing.previous] : [])]
      : typeof protectedHeader.kid === "string"
        ? [keyRing.current, ...(keyRing.previous ? [keyRing.previous] : [])].filter((key) => key.id === protectedHeader.kid)
        : [];
    let verified: JWTVerifyResult | null = null;
    for (const key of keys) {
      try {
        verified = await jwtVerify(token, key.secret, {
          algorithms: ["HS256"],
          issuer: AUTH_SESSION_ISSUER,
          audience: AUTH_SESSION_AUDIENCE,
          requiredClaims: ["sub", "externalUserId", "iat", "exp", "iss", "aud"],
          clockTolerance: AUTH_POLICY.sessionClockToleranceSeconds,
        });
        break;
      } catch {
        // A key mismatch is indistinguishable from a malformed token here.
      }
    }
    if (!verified) return null;
    const { sub, externalUserId, iat, exp, jti } = verified.payload;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      typeof sub !== "string"
      || sub.length === 0
      || typeof externalUserId !== "string"
      || externalUserId.length === 0
      || typeof iat !== "number"
      || !Number.isFinite(iat)
      || !Number.isInteger(iat)
      || typeof exp !== "number"
      || !Number.isFinite(exp)
      || !Number.isInteger(exp)
      || iat > nowSeconds + AUTH_POLICY.sessionClockToleranceSeconds
      || exp <= iat
      || exp - iat > AUTH_POLICY.sessionTtlSeconds
    ) {
      return null;
    }
    if (process.env.AUTH_SESSION_REVOCATION_ENFORCED === "true") {
      if (typeof jti !== "string" || !/^[0-9a-f-]{36}$/i.test(jti) || await revoked({ jti, userId: sub, issuedAt: new Date(iat * 1000).toISOString() })) return null;
    }
    let canonicalExternalUserId = externalUserId;
    if (hasVerificationPepperOverlapConfiguration()) {
      // Validate the complete overlap contract before any compatibility lookup.
      verificationPepperKeyRing();
      const resolved = await resolveExternalUserId({ userId: sub, externalUserId });
      if (!resolved) return null;
      canonicalExternalUserId = resolved;
    }
    return {
      userId: sub,
      externalUserId: canonicalExternalUserId,
      authenticatedAt: new Date(iat * 1000).toISOString(),
      expiresAt: new Date(exp * 1000).toISOString(),
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
