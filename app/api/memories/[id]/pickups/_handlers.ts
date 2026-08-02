import { NextRequest, NextResponse } from "next/server";

import { resolveSessionOwner, type SessionResolver } from "@/app/api/memories/_session-user-boundary";
import { ConfirmedPickupError, ConfirmedPickupPostgresService } from "@/features/pickup";
import { AuthConfigurationError, requireAllowedOrigin } from "@/src/server/auth";
import { DatabaseDependencyError, safeDatabaseErrorLog } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type CollectionContext = { params: Promise<{ id: string }> };
type ItemContext = { params: Promise<{ id: string; pickupId: string }> };
type Service = Pick<ConfirmedPickupPostgresService, "confirm" | "list" | "update" | "delete">;
type ServiceFactory = () => Service;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,64}$/;
const createService: ServiceFactory = () => new ConfirmedPickupPostgresService();

function json(body: Record<string, unknown>, init?: ResponseInit): NextResponse {
  return applyAuthNoStore(NextResponse.json(body, init));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseConfirmation(value: unknown): { originalText: string; organizedText: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 3 || body.confirmed !== true) return null;
  const originalText = text(body.originalText);
  const organizedText = text(body.organizedText);
  return originalText && organizedText ? { originalText, organizedText } : null;
}

function parseUpdate(value: unknown): { originalText: string; organizedText: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 2) return null;
  const originalText = text(body.originalText);
  const organizedText = text(body.organizedText);
  return originalText && organizedText ? { originalText, organizedText } : null;
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ConfirmedPickupError) {
    const status = error.code === "MEMORY_NOT_FOUND" || error.code === "PICKUP_NOT_FOUND" ? 404 : error.code === "REQUEST_KEY_CONFLICT" ? 409 : 400;
    return json({ error: error.code }, { status });
  }
  if (error instanceof DatabaseDependencyError) {
    console.error("[api:pickups] database request failed", safeDatabaseErrorLog(error));
    return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof AuthConfigurationError) {
    return json({ error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" }, { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 });
  }
  console.error("[api:pickups] unexpected request failure");
  return json({ error: "PICKUP_REQUEST_FAILED" }, { status: 500 });
}

export function createConfirmedPickupHandlers(
  serviceFactory: ServiceFactory = createService,
  sessionResolver?: SessionResolver,
) {
  async function owner(request: NextRequest) {
    return resolveSessionOwner(request, undefined, sessionResolver);
  }

  return {
    async GET(request: NextRequest, context: CollectionContext) {
      const resolved = await owner(request);
      if ("response" in resolved) return resolved.response;
      try {
        const { id: memoryId } = await context.params;
        return json({ pickups: await serviceFactory().list({ externalUserId: resolved.externalUserId, memoryId }) });
      } catch (error) {
        return errorResponse(error);
      }
    },

    async POST(request: NextRequest, context: CollectionContext) {
      const resolved = await owner(request);
      if ("response" in resolved) return resolved.response;
      try {
        requireAllowedOrigin(request);
        const requestKey = request.headers.get("idempotency-key");
        const body = parseConfirmation(await request.json().catch(() => null));
        if (!requestKey || !IDEMPOTENCY_KEY_PATTERN.test(requestKey) || !body) return json({ error: "INVALID_REQUEST" }, { status: 400 });
        const { id: memoryId } = await context.params;
        const pickup = await serviceFactory().confirm({ externalUserId: resolved.externalUserId, memoryId, requestKey, ...body });
        return json({ pickup }, { status: 201 });
      } catch (error) {
        return errorResponse(error);
      }
    },

    async PATCH(request: NextRequest, context: ItemContext) {
      const resolved = await owner(request);
      if ("response" in resolved) return resolved.response;
      try {
        requireAllowedOrigin(request);
        const body = parseUpdate(await request.json().catch(() => null));
        if (!body) return json({ error: "INVALID_REQUEST" }, { status: 400 });
        const { id: memoryId, pickupId } = await context.params;
        const pickup = await serviceFactory().update({ externalUserId: resolved.externalUserId, memoryId, pickupId, ...body });
        return json({ pickup });
      } catch (error) {
        return errorResponse(error);
      }
    },

    async DELETE(request: NextRequest, context: ItemContext) {
      const resolved = await owner(request);
      if ("response" in resolved) return resolved.response;
      try {
        requireAllowedOrigin(request);
        const { id: memoryId, pickupId } = await context.params;
        await serviceFactory().delete({ externalUserId: resolved.externalUserId, memoryId, pickupId });
        return applyAuthNoStore(new NextResponse(null, { status: 204 }));
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}
