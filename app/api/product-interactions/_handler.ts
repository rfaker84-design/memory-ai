import { NextRequest, NextResponse } from "next/server";

import {
  ProductMetricsError,
  ProductMetricsPostgresDataSource,
  PRODUCT_INTERACTION_EVENTS,
  PRODUCT_INTERACTION_SCHEMA_VERSION,
  type ProductInteractionEventName,
  type ProductInteractionProperties,
} from "@/features/product-metrics";
import { consumeProductInteractionRateLimit } from "@/features/product-metrics/product-interaction-security";
import { AuthConfigurationError, requireAllowedOrigin, verifyRequestSession } from "@/src/server/auth";
import { resolveMetricsAnonymousSession, setMetricsAnonymousSessionCookie, type MetricsAnonymousSession } from "@/src/server/auth/metrics-anonymous-session";
import { DatabaseDependencyError } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Recorder = Pick<ProductMetricsPostgresDataSource, "recordInteraction">;
type SessionResolver = typeof verifyRequestSession;
type OriginGuard = typeof requireAllowedOrigin;
const MAX_BODY_BYTES = 8 * 1024;

const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[-A-Za-z0-9._:]{16,160}$/;

type ParsedBody = {
  schemaVersion: typeof PRODUCT_INTERACTION_SCHEMA_VERSION;
  eventName: ProductInteractionEventName;
  idempotencyKey: string;
  memoryId?: string;
  requestId?: string;
  properties: ProductInteractionProperties;
};

function exactly(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validProperties(eventName: ProductInteractionEventName, value: unknown): ProductInteractionProperties | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const properties = value as Record<string, unknown>;
  if (eventName === "guest_experience_started" && exactly(properties, ["surface"]) && properties.surface === "guest_home") return properties as ProductInteractionProperties;
  if (eventName === "photo_upload_succeeded" && exactly(properties, ["surface"]) && properties.surface === "first_presence") return properties as ProductInteractionProperties;
  if (eventName === "first_presence_video_played_3s"
    && Object.keys(properties).every((key) => key === "elapsed_ms" || key === "job_id")
    && properties.elapsed_ms === 3000
    && (properties.job_id === undefined || (typeof properties.job_id === "string" && UUID.test(properties.job_id)))) return properties as ProductInteractionProperties;
  if (eventName === "paywall_viewed"
    && Object.keys(properties).every((key) => key === "surface" || key === "offer_id")
    && properties.surface === "commerce"
    && (properties.offer_id === undefined || (typeof properties.offer_id === "string" && /^[a-z0-9._:-]{1,64}$/.test(properties.offer_id)))) return properties as ProductInteractionProperties;
  return null;
}

export function validProductInteractionBody(value: unknown): ParsedBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const allowed = new Set(["schemaVersion", "eventName", "idempotencyKey", "memoryId", "requestId", "properties"]);
  if (Object.keys(body).some((key) => !allowed.has(key))
    || body.schemaVersion !== PRODUCT_INTERACTION_SCHEMA_VERSION
    || typeof body.eventName !== "string"
    || !PRODUCT_INTERACTION_EVENTS.includes(body.eventName as ProductInteractionEventName)
    || typeof body.idempotencyKey !== "string"
    || !KEY.test(body.idempotencyKey)) return null;
  for (const key of ["memoryId", "requestId"] as const) {
    if (body[key] !== undefined && (typeof body[key] !== "string" || !UUID.test(body[key] as string))) return null;
  }
  const properties = validProperties(body.eventName as ProductInteractionEventName, body.properties);
  if (!properties) return null;
  return {
    schemaVersion: PRODUCT_INTERACTION_SCHEMA_VERSION,
    eventName: body.eventName as ProductInteractionEventName,
    idempotencyKey: body.idempotencyKey,
    ...(typeof body.memoryId === "string" ? { memoryId: body.memoryId } : {}),
    ...(typeof body.requestId === "string" ? { requestId: body.requestId } : {}),
    properties,
  };
}

export function createProductInteractionHandler(
  recorderFactory: () => Recorder = () => new ProductMetricsPostgresDataSource(),
  sessionResolver: SessionResolver = verifyRequestSession,
  originGuard: OriginGuard = requireAllowedOrigin,
  anonymousResolver: (request: NextRequest) => Promise<MetricsAnonymousSession> = resolveMetricsAnonymousSession,
  anonymousCookieWriter: (response: NextResponse, session: MetricsAnonymousSession) => Promise<void> = setMetricsAnonymousSessionCookie,
  rateLimit: typeof consumeProductInteractionRateLimit = consumeProductInteractionRateLimit,
) {
  return async function POST(request: NextRequest) {
    try {
      originGuard(request);
      if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ error: "INVALID_EVENT" }, { status: 400 });
      const declaredLength = Number(request.headers.get("content-length") ?? "0");
      if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_BODY_BYTES) return json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
      const raw = await request.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return json({ error: "INVALID_JSON" }, { status: 400 }); }
      const body = validProductInteractionBody(parsed);
      if (!body) return json({ error: "INVALID_EVENT" }, { status: 400 });

      const session = await sessionResolver(request);
      const anonymous = session ? null : await anonymousResolver(request);
      const subject = session ? `owner:${session.userId}` : `anon:${anonymous!.id}`;
      const admission = rateLimit(subject);
      if (!admission.allowed) return json({ error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(admission.retryAfterSeconds) } });

      const result = await recorderFactory().recordInteraction({
        ...body,
        source: "web",
        ...(session ? { externalUserId: session.externalUserId } : { anonymousSessionId: anonymous!.id }),
      });
      const response = json(result);
      if (anonymous) await anonymousCookieWriter(response, anonymous);
      return response;
    } catch (error) {
      if (error instanceof ProductMetricsError) return json({ error: error.code }, { status: error.code === "METRICS_OWNER_NOT_FOUND" ? 404 : 400 });
      if (error instanceof AuthConfigurationError) return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
      if (error instanceof DatabaseDependencyError) return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
      console.error("[api:product-interactions] event recording failed");
      return json({ error: "EVENT_RECORDING_FAILED" }, { status: 500 });
    }
  };
}
