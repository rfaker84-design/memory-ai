import { NextRequest, NextResponse } from "next/server";

import {
  FirstPresenceVideoOwnerApiError,
  FirstPresenceVideoOwnerApiService,
  FirstPresenceVideoOwnerPostgresPort,
  NoopFirstPresenceVideoQueuePort,
  type FirstPresenceVideoIntent,
} from "../../../../../features/video";
import {
  AuthConfigurationError,
  requireAllowedOrigin,
  type AuthSession,
  verifyRequestSession,
} from "../../../../../src/server/auth";
import { DatabaseDependencyError } from "../../../../../src/server/database";
import { applyAuthNoStore } from "../../../../../src/server/security/auth-cache";

type Context = { params: Promise<{ id: string }> };
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type OwnerVideoApiService = Pick<
  FirstPresenceVideoOwnerApiService,
  "create" | "list"
>;

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

const service = (): OwnerVideoApiService => {
  const postgres = new FirstPresenceVideoOwnerPostgresPort();
  return new FirstPresenceVideoOwnerApiService(
    postgres,
    postgres,
    new NoopFirstPresenceVideoQueuePort(),
  );
};

function parseIntent(body: unknown): FirstPresenceVideoIntent | null {
  if (
    typeof body !== "object"
    || body === null
    || Array.isArray(body)
    || Object.keys(body).join(",") !== "intent"
  ) {
    return null;
  }
  const intent = (body as Record<string, unknown>).intent;
  return intent === "initial_preview" || intent === "additional_generation"
    ? intent
    : null;
}

function failure(error: unknown) {
  if (error instanceof FirstPresenceVideoOwnerApiError) {
    const statusByCode: Record<string, number> = {
      INVALID_USER_ID: 400,
      INVALID_MEMORY_ID: 400,
      INVALID_IDEMPOTENCY_KEY: 400,
      IDEMPOTENCY_PAYLOAD_CONFLICT: 409,
      MEMORY_NOT_FOUND: 404,
      PHOTO_PRECONDITION_REQUIRED: 409,
      TWO_CHAT_ROUNDS_REQUIRED: 409,
      FREE_PREVIEW_ONLY_AVAILABLE_FOR_FIRST_MEMORY: 409,
      FREE_PREVIEW_ALREADY_USED: 409,
      GENERATION_CREDIT_UNAVAILABLE: 409,
      TA_LIMIT_EXCEEDED: 409,
    };
    return json(
      { error: error.code },
      { status: statusByCode[error.code] ?? 400 },
    );
  }
  if (error instanceof DatabaseDependencyError) {
    return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof AuthConfigurationError) {
    return json(
      { error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" },
      { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 },
    );
  }
  console.error("[api:first-presence-video] request failed");
  return json({ error: "FIRST_PRESENCE_VIDEO_REQUEST_FAILED" }, { status: 500 });
}

export function createFirstPresenceVideoHandler(
  serviceFactory: () => OwnerVideoApiService = service,
  sessionResolver: SessionResolver = verifyRequestSession,
) {
  return {
    GET: async (request: NextRequest, { params }: Context) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        if ([...request.nextUrl.searchParams.keys()].length > 0) {
          return json({ error: "INVALID_FIRST_PRESENCE_VIDEO_REQUEST" }, { status: 400 });
        }
        const { id: memoryId } = await params;
        const jobs = await serviceFactory().list({
          externalUserId: session.externalUserId,
          memoryId,
        });
        return json({ jobs });
      } catch (error) {
        return failure(error);
      }
    },
    POST: async (request: NextRequest, { params }: Context) => {
      try {
        const session = await sessionResolver(request);
        if (!session) return json({ error: "UNAUTHENTICATED" }, { status: 401 });
        requireAllowedOrigin(request);
        const idempotencyKey = request.headers.get("idempotency-key");
        if (!idempotencyKey || !KEY_PATTERN.test(idempotencyKey)) {
          return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
        }
        const body = await request.json().catch(() => null);
        const intent = parseIntent(body);
        if (!intent) {
          return json({ error: "INVALID_FIRST_PRESENCE_VIDEO_REQUEST" }, { status: 400 });
        }
        const { id: memoryId } = await params;
        const job = await serviceFactory().create({
          externalUserId: session.externalUserId,
          memoryId,
          idempotencyKey,
          intent,
        });
        return json({ job }, { status: 202 });
      } catch (error) {
        return failure(error);
      }
    },
  };
}
