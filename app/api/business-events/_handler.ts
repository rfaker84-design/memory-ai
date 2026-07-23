import { NextRequest, NextResponse } from "next/server";

import { BusinessMetricsPostgresDataSource, type ClientViewEvent } from "@/features/business-metrics";
import { AuthConfigurationError, requireAllowedOrigin, verifyRequestSession } from "@/src/server/auth";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const ALLOWED_EVENTS = new Set<ClientViewEvent>(["first_greeting_viewed", "payment_entry_viewed"]);
type SessionResolver = typeof verifyRequestSession;
type EventRecorder = Pick<BusinessMetricsPostgresDataSource, "recordViewedEvent">;
const json = (body: Record<string, string | boolean>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));

export function createBusinessEventsHandler(
  recorderFactory: () => EventRecorder = () => new BusinessMetricsPostgresDataSource(),
  sessionResolver: SessionResolver = verifyRequestSession,
) {
  return async function POST(request: NextRequest) {
    try {
      const session = await sessionResolver(request);
      if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
      requireAllowedOrigin(request);
      if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ error: "INVALID_EVENT" }, { status: 400 });
      let body: unknown;
      try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, { status: 400 }); }
      if (typeof body !== "object" || body === null || Array.isArray(body)) return json({ error: "INVALID_EVENT" }, { status: 400 });
      const record = body as Record<string, unknown>;
      if (Object.keys(record).length !== 2 || typeof record.memoryId !== "string" || typeof record.event !== "string" || !ALLOWED_EVENTS.has(record.event as ClientViewEvent)) {
        return json({ error: "INVALID_EVENT" }, { status: 400 });
      }
      const recorded = await recorderFactory().recordViewedEvent({ externalUserId: session.externalUserId, memoryId: record.memoryId, event: record.event as ClientViewEvent });
      return json({ recorded });
    } catch (error) {
      if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
      if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
      if ((error as Error).message === "MEMORY_NOT_FOUND" || (error as Error).message === "INVALID_MEMORY_ID") return json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
      console.error("[api:business-events] event recording failed");
      return json({ error: "EVENT_RECORDING_FAILED" }, { status: 500 });
    }
  };
}
