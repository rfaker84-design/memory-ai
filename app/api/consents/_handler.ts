import { NextRequest, NextResponse } from "next/server";

import { DatabaseDependencyError, safeDatabaseErrorLog, withPostgresTransaction } from "@/src/server/database";
import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import {
  TRUST_CONSENT_VERSION,
  type TrustConsentType,
} from "@/features/consent/trust-consent-postgres";

const CONSENT_TYPES = new Set(["adult_eligibility", "memory_profile", "media_asset", "commercial_use", "crisis_support_escalation"]);
const REQUEST_KEY = /^[A-Za-z0-9._:-]{16,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type RecordConsent = (input: { externalUserId: string; consentType: TrustConsentType; memoryId: string | null; requestKey: string }) => Promise<void>;
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type RevokeConsent = (input: { externalUserId: string }) => Promise<void>;

const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

function parseBody(value: unknown): { consentType: TrustConsentType; memoryId: string | null } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  if (keys.join(",") !== "consentType" && keys.join(",") !== "consentType,memoryId") return null;
  if (typeof body.consentType !== "string" || !CONSENT_TYPES.has(body.consentType)) return null;
  const memoryId = body.memoryId;
  if (memoryId !== undefined && (typeof memoryId !== "string" || !UUID.test(memoryId))) return null;
  if ((body.consentType === "media_asset" || body.consentType === "commercial_use") && memoryId === undefined) return null;
  return { consentType: body.consentType as TrustConsentType, memoryId: typeof memoryId === "string" ? memoryId : null };
}

const recordConsent: RecordConsent = async ({ externalUserId, consentType, memoryId, requestKey }) => {
  await withPostgresTransaction(async (client) => {
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (external_id) VALUES ($1)
       ON CONFLICT (external_id) DO UPDATE SET updated_at = users.updated_at
       RETURNING id`, [externalUserId],
    );
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error("CONSENT_USER_UNAVAILABLE");
    if (memoryId) {
      const owned = await client.query(
        `SELECT m.id FROM memories m WHERE m.id = $1 AND m.user_id = $2 FOR KEY SHARE`, [memoryId, userId],
      );
      if (!owned.rows[0]) throw new Error("CONSENT_MEMORY_NOT_FOUND");
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `memoryai:consent:${userId}:${consentType}:${memoryId ?? "account"}:${requestKey}`,
    ]);
    const written = await client.query(
      `SELECT id FROM consent_records WHERE user_id = $1 AND consent_type = $2
       AND memory_id IS NOT DISTINCT FROM $3 AND metadata ->> 'version' = $4 LIMIT 1`,
      [userId, consentType, memoryId, TRUST_CONSENT_VERSION],
    );
    if (written.rows[0]) return;
    await client.query(
      `INSERT INTO consent_records (user_id, memory_id, consent_type, status, notes, metadata)
       VALUES ($1, $2, $3, 'approved', $4, $5::jsonb)`,
      [userId, memoryId, consentType, TRUST_CONSENT_VERSION, JSON.stringify({ requestKey, version: TRUST_CONSENT_VERSION })],
    );
  });
};

const revokeCrisisSupportConsent: RevokeConsent = async ({ externalUserId }) => {
  await withPostgresTransaction(async (client) => {
    await client.query(
      `UPDATE public.consent_records SET status='revoked'
        WHERE user_id=(SELECT id FROM public.users WHERE external_id=$1)
          AND consent_type='crisis_support_escalation' AND memory_id IS NULL
          AND metadata ->> 'version'=$2`,
      [externalUserId, TRUST_CONSENT_VERSION],
    );
  });
};

function failure(error: unknown) {
  if (error instanceof DatabaseDependencyError) {
    console.error("[api:consents] database request failed", safeDatabaseErrorLog(error));
    return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  if (error instanceof Error && error.message === "CONSENT_MEMORY_NOT_FOUND") return json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
  console.error("[api:consents] request failed");
  return json({ error: "CONSENT_RECORD_FAILED" }, { status: 500 });
}

export function createConsentsHandler(writeConsent: RecordConsent = recordConsent, sessionResolver: SessionResolver = verifyRequestSession) {
  return async function POST(request: NextRequest) {
    try {
      const session = await sessionResolver(request);
      if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
      requireAllowedOrigin(request);
      const requestKey = request.headers.get("idempotency-key");
      if (!requestKey || !REQUEST_KEY.test(requestKey)) return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
      const parsed = parseBody(await request.json().catch(() => null));
      if (!parsed) return json({ error: "INVALID_CONSENT_REQUEST" }, { status: 400 });
      await writeConsent({ externalUserId: session.externalUserId, requestKey, ...parsed });
      return json({ recorded: true });
    } catch (error) { return failure(error); }
  };
}

export function createCrisisSupportConsentRevocationHandler(removeConsent: RevokeConsent = revokeCrisisSupportConsent, sessionResolver: SessionResolver = verifyRequestSession) {
  return async function DELETE(request: NextRequest) {
    try {
      const session = await sessionResolver(request);
      if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
      requireAllowedOrigin(request);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      if (!body || Object.keys(body).join(",") !== "consentType" || body.consentType !== "crisis_support_escalation") return json({ error: "INVALID_CONSENT_REQUEST" }, { status: 400 });
      await removeConsent({ externalUserId: session.externalUserId });
      return json({ revoked: true });
    } catch (error) { return failure(error); }
  };
}
