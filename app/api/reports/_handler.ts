import { NextRequest, NextResponse } from "next/server";

import { PostgresUserReportService, REPORT_ACTIONS, REPORT_CATEGORIES, REPORT_SUBJECT_TYPES, UserReportError, type UserReport } from "@/features/reports";
import { AuthConfigurationError, requireAllowedOrigin, type AuthSession, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError, safeDatabaseErrorLog } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const REQUEST_KEY = /^[A-Za-z0-9._:-]{16,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Service = Pick<PostgresUserReportService, "create" | "list">;
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

function parse(value: unknown): Omit<Parameters<Service["create"]>[0], "userId" | "externalUserId" | "requestKey"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).sort().join(",") !== "category,details,requestedAction,subjectId,subjectType") return null;
  if (typeof body.category !== "string" || !REPORT_CATEGORIES.includes(body.category as UserReport["category"])) return null;
  if (typeof body.subjectType !== "string" || !REPORT_SUBJECT_TYPES.includes(body.subjectType as UserReport["subjectType"])) return null;
  if (typeof body.requestedAction !== "string" || !REPORT_ACTIONS.includes(body.requestedAction as UserReport["requestedAction"])) return null;
  if (typeof body.details !== "string" || !body.details.trim() || body.details.trim().length > 2000) return null;
  const subjectId = body.subjectId;
  if ((body.subjectType === "other" && subjectId !== null) || (body.subjectType !== "other" && (typeof subjectId !== "string" || !UUID.test(subjectId)))) return null;
  return { category: body.category as UserReport["category"], subjectType: body.subjectType as UserReport["subjectType"], subjectId: subjectId as string | null, requestedAction: body.requestedAction as UserReport["requestedAction"], details: body.details.trim() };
}

function failure(error: unknown) {
  if (error instanceof UserReportError) return json({ error: error.code }, { status: error.code === "SUBJECT_NOT_FOUND" ? 404 : 401 });
  if (error instanceof DatabaseDependencyError) { console.error("[api:reports] database request failed", safeDatabaseErrorLog(error)); return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 }); }
  if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  console.error("[api:reports] request failed"); return json({ error: "REPORT_REQUEST_FAILED" }, { status: 500 });
}

export function createReportsHandler(service: Service = new PostgresUserReportService(), sessionResolver: SessionResolver = verifyRequestSession) {
  return {
    async GET(request: NextRequest) {
      try { const session = await sessionResolver(request); if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 }); return json({ reports: await service.list({ userId: session.userId, externalUserId: session.externalUserId }) }); } catch (error) { return failure(error); }
    },
    async POST(request: NextRequest) {
      try {
        const session = await sessionResolver(request); if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 }); requireAllowedOrigin(request);
        const requestKey = request.headers.get("idempotency-key"); if (!requestKey || !REQUEST_KEY.test(requestKey)) return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
        const body = parse(await request.json().catch(() => null)); if (!body) return json({ error: "INVALID_REPORT_REQUEST" }, { status: 400 });
        const report = await service.create({ userId: session.userId, externalUserId: session.externalUserId, requestKey, ...body }); return json({ report }, { status: 201 });
      } catch (error) { return failure(error); }
    },
  };
}
