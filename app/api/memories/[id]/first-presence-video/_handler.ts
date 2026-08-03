import { NextRequest, NextResponse } from "next/server";

import {
  FirstPresenceVideoOwnerApiError,
  FirstPresenceVideoOwnerApiService,
  FirstPresenceVideoOwnerPostgresPort,
  NoopFirstPresenceVideoQueuePort,
  createFirstPresenceVideoOwnerInputStaging,
  type AdditionalVideoCreditSource,
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
import {
  assertProductCapabilityEnabled,
  ProductCapabilityUnavailableError,
  type ProductCapability,
} from "../../../../../src/server/runtime/product-capability-gate";

type Context = { params: Promise<{ id: string }> };
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type OwnerVideoApiService = Pick<
  FirstPresenceVideoOwnerApiService,
  "create" | "list"
>;
type CapabilityAssertion = (capability: ProductCapability) => void;

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

const service = (): OwnerVideoApiService => {
  const postgres = new FirstPresenceVideoOwnerPostgresPort(
    createFirstPresenceVideoOwnerInputStaging,
  );
  return new FirstPresenceVideoOwnerApiService(
    postgres,
    postgres,
    new NoopFirstPresenceVideoQueuePort(),
  );
};

function parseVideoRequest(body: unknown): {
  intent: FirstPresenceVideoIntent;
  creditSource?: AdditionalVideoCreditSource;
} | null {
  if (
    typeof body !== "object"
    || body === null
    || Array.isArray(body)
  ) {
    return null;
  }
  const value = body as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "intent" && keys.join(",") !== "creditSource,intent") {
    return null;
  }
  const intent = value.intent;
  if (intent !== "initial_preview" && intent !== "additional_generation") return null;
  const creditSource = value.creditSource;
  if (creditSource !== undefined && creditSource !== "occasion_reward") return null;
  if (intent === "initial_preview" && creditSource !== undefined) return null;
  return creditSource === undefined ? { intent } : { intent, creditSource };
}

function failure(error: unknown) {
  if (error instanceof ProductCapabilityUnavailableError) {
    return json({ error: error.code }, { status: 503 });
  }
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
      INVALID_CREDIT_SOURCE: 400,
      TA_LIMIT_EXCEEDED: 409,
      VIDEO_INPUT_STAGING_UNAVAILABLE: 503,
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
  assertCapability: CapabilityAssertion = assertProductCapabilityEnabled,
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
        assertCapability("video_generation");
        const idempotencyKey = request.headers.get("idempotency-key");
        if (!idempotencyKey || !KEY_PATTERN.test(idempotencyKey)) {
          return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
        }
        const body = await request.json().catch(() => null);
        const input = parseVideoRequest(body);
        if (!input) {
          return json({ error: "INVALID_FIRST_PRESENCE_VIDEO_REQUEST" }, { status: 400 });
        }
        const { id: memoryId } = await params;
        const job = await serviceFactory().create({
          externalUserId: session.externalUserId,
          memoryId,
          idempotencyKey,
          ...input,
        });
        return json({ job }, { status: 202 });
      } catch (error) {
        return failure(error);
      }
    },
  };
}
