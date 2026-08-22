import { randomUUID } from "node:crypto";

import { decodeProtectedHeader, jwtVerify, SignJWT } from "jose";
import type { NextRequest, NextResponse } from "next/server";

import { sessionSigningKeyRing } from "./crypto";

export const METRICS_ANONYMOUS_COOKIE = "__Host-memoryai_metrics_anon";
const AUDIENCE = "memoryai-product-metrics-anonymous";
const ISSUER = "memoryai";
const TTL_SECONDS = 30 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MetricsAnonymousSession = Readonly<{ id: string; newlyIssued: boolean }>;

async function verify(token: string): Promise<string | null> {
  try {
    const header = decodeProtectedHeader(token);
    const ring = sessionSigningKeyRing();
    const keys = [ring.current, ...(ring.previous ? [ring.previous] : [])].filter((key) => header.kid === key.id);
    for (const key of keys) {
      try {
        const result = await jwtVerify(token, key.secret, { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE, requiredClaims: ["sub", "exp", "iat", "jti"] });
        if (result.payload.kind === "product-metrics-anonymous" && typeof result.payload.sub === "string" && UUID.test(result.payload.sub)) return result.payload.sub;
      } catch {
        // Invalid and expired cookies are replaced below without disclosing why.
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveMetricsAnonymousSession(request: NextRequest): Promise<MetricsAnonymousSession> {
  const current = request.cookies.get(METRICS_ANONYMOUS_COOKIE)?.value;
  const id = current ? await verify(current) : null;
  return id ? { id, newlyIssued: false } : { id: randomUUID(), newlyIssued: true };
}

export async function setMetricsAnonymousSessionCookie(response: NextResponse, session: MetricsAnonymousSession): Promise<void> {
  if (!session.newlyIssued) return;
  const token = await issueForId(session.id);
  response.cookies.set({ name: METRICS_ANONYMOUS_COOKIE, value: token, secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: TTL_SECONDS });
}

async function issueForId(id: string, now = new Date()): Promise<string> {
  const key = sessionSigningKeyRing().current;
  return new SignJWT({ kind: "product-metrics-anonymous" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: key.id })
    .setSubject(id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + TTL_SECONDS)
    .setJti(randomUUID())
    .sign(key.secret);
}
