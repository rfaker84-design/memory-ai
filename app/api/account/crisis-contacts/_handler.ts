import { NextRequest, NextResponse } from "next/server";

import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError, withPostgresTransaction } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type ContactRow = { id: string; ownerUserId: string; contactUserId: string; status: "pending" | "accepted" | "revoked"; requestedAt: string; acceptedAt: string | null };
type Contact = { id: string; role: "owner" | "contact"; status: "pending" | "accepted" | "revoked"; requestedAt: string; acceptedAt: string | null };
type Service = {
  list: (userId: string) => Promise<Contact[]>;
  request: (input: { ownerUserId: string; contactExternalId: string }) => Promise<void>;
  accept: (input: { contactUserId: string; consentId: string }) => Promise<boolean>;
  revoke: (input: { userId: string; consentId: string }) => Promise<boolean>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

const service: Service = {
  list: (userId) => withPostgresTransaction(async (client) => (await client.query<ContactRow>(
    `SELECT id, owner_user_id AS "ownerUserId", contact_user_id AS "contactUserId", status, requested_at AS "requestedAt", accepted_at AS "acceptedAt"
       FROM public.crisis_contact_consents WHERE owner_user_id=$1::uuid OR contact_user_id=$1::uuid ORDER BY requested_at DESC`, [userId],
  )).rows.map(({ id, ownerUserId, status, requestedAt, acceptedAt }) => ({ id, role: ownerUserId === userId ? "owner" : "contact", status, requestedAt, acceptedAt }))),
  request: ({ ownerUserId, contactExternalId }) => withPostgresTransaction(async (client) => {
    const target = await client.query<{ id: string }>("SELECT id FROM public.users WHERE external_id=$1 LIMIT 1", [contactExternalId]);
    const contactUserId = target.rows[0]?.id;
    if (!contactUserId || contactUserId === ownerUserId) return;
    await client.query(
      `INSERT INTO public.crisis_contact_consents (owner_user_id, contact_user_id)
       VALUES ($1::uuid,$2::uuid)
       ON CONFLICT (owner_user_id,contact_user_id) DO UPDATE SET status='pending', requested_at=NOW(), accepted_at=NULL, revoked_at=NULL`,
      [ownerUserId, contactUserId],
    );
  }),
  accept: ({ contactUserId, consentId }) => withPostgresTransaction(async (client) => {
    const result = await client.query("UPDATE public.crisis_contact_consents SET status='accepted', accepted_at=NOW(), revoked_at=NULL WHERE id=$1::uuid AND contact_user_id=$2::uuid AND status='pending' RETURNING id", [consentId, contactUserId]);
    return (result.rowCount ?? 0) === 1;
  }),
  revoke: ({ userId, consentId }) => withPostgresTransaction(async (client) => {
    const result = await client.query("UPDATE public.crisis_contact_consents SET status='revoked', revoked_at=NOW() WHERE id=$1::uuid AND (owner_user_id=$2::uuid OR contact_user_id=$2::uuid) AND status <> 'revoked' RETURNING id", [consentId, userId]);
    return (result.rowCount ?? 0) === 1;
  }),
};

function fail(error: unknown) {
  if (error instanceof DatabaseDependencyError) return json({ error: "CRISIS_CONTACTS_UNAVAILABLE" }, { status: 503 });
  if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  return json({ error: "CRISIS_CONTACTS_UNAVAILABLE" }, { status: 503 });
}

export function createCrisisContactsHandler(contacts: Service = service, sessionResolver: SessionResolver = verifyRequestSession) {
  const session = async (request: NextRequest) => { const value = await sessionResolver(request); return value ? value : null; };
  return {
    GET: async (request: NextRequest) => { try { const value = await session(request); if (!value) return json({ error: "UNAUTHENTICATED" }, { status: 401 }); return json({ contacts: await contacts.list(value.userId) }); } catch (error) { return fail(error); } },
    POST: async (request: NextRequest) => { try { const value = await session(request); if (!value) return json({ error: "UNAUTHENTICATED" }, { status: 401 }); requireAllowedOrigin(request); const body = await request.json().catch(() => null) as Record<string, unknown> | null; if (!body || Object.keys(body).join(",") !== "contactExternalId" || typeof body.contactExternalId !== "string" || !body.contactExternalId.trim()) return json({ error: "INVALID_CRISIS_CONTACT_REQUEST" }, { status: 400 }); await contacts.request({ ownerUserId: value.userId, contactExternalId: body.contactExternalId.trim() }); return json({ requested: true }); } catch (error) { return fail(error); } },
    PATCH: async (request: NextRequest) => { try { const value = await session(request); if (!value) return json({ error: "UNAUTHENTICATED" }, { status: 401 }); requireAllowedOrigin(request); const body = await request.json().catch(() => null) as Record<string, unknown> | null; if (!body || Object.keys(body).length !== 2 || typeof body.consentId !== "string" || !UUID.test(body.consentId) || (body.action !== "accept" && body.action !== "revoke")) return json({ error: "INVALID_CRISIS_CONTACT_REQUEST" }, { status: 400 }); const updated = body.action === "accept" ? await contacts.accept({ contactUserId: value.userId, consentId: body.consentId }) : await contacts.revoke({ userId: value.userId, consentId: body.consentId }); return json({ updated }); } catch (error) { return fail(error); } },
  };
}
