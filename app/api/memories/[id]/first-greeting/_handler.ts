import { NextRequest, NextResponse } from "next/server";

import {
  ChatPostgresDataSource,
  ChatNotFoundError,
  ChatRepository,
  ChatService,
  FirstGreetingInProgressError,
  FirstGreetingProviderError,
  FirstGreetingService,
} from "../../../../../features/chat";
import { MemoryValidationError } from "../../../../../features/memory/errors";
import { MemoryPostgresDataSource } from "../../../../../features/memory/memory-postgres-datasource";
import { MemoryRepository } from "../../../../../features/memory/memory-repository";
import { MemoryService } from "../../../../../features/memory/memory-service";
import {
  AuthConfigurationError,
  requireAllowedOrigin,
} from "../../../../../src/server/auth";
import {
  DatabaseDependencyError,
  safeDatabaseErrorLog,
} from "../../../../../src/server/database";
import {
  resolveSessionOwner,
  type SessionResolver,
} from "../../_session-user-boundary";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ id: string }> };
type MemoryOwnershipService = Pick<MemoryService, "getMemoryForUser">;
type GreetingService = Pick<FirstGreetingService, "create">;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

function isEmptyJsonObject(value: unknown): value is Record<string, never> {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).length === 0
  );
}

const createMemoryService = (): MemoryOwnershipService =>
  new MemoryService(new MemoryRepository(new MemoryPostgresDataSource()));

const createFirstGreetingService = (): GreetingService =>
  new FirstGreetingService(
    new ChatService(new ChatRepository(new ChatPostgresDataSource()))
  );

const json = (body: unknown, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

export function createFirstGreetingHandler(
  memoryServiceFactory: () => MemoryOwnershipService = createMemoryService,
  greetingServiceFactory: () => GreetingService = createFirstGreetingService,
  sessionResolver?: SessionResolver
) {
  return async function POST(request: NextRequest, { params }: Context) {
    try {
      requireAllowedOrigin(request);
      const owner = await resolveSessionOwner(request, undefined, sessionResolver);
      if ("response" in owner) return owner.response;

      const idempotencyKey = request.headers.get("idempotency-key");
      if (!idempotencyKey) {
        return json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
      }
      if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
        return json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "INVALID_JSON" }, { status: 400 });
      }
      if (!isEmptyJsonObject(body)) {
        return json({ error: "INVALID_JSON" }, { status: 400 });
      }

      const { id: memoryId } = await params;
      const memory = await memoryServiceFactory().getMemoryForUser(
        memoryId,
        owner.externalUserId
      );
      if (!memory) {
        return json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
      }

      const greeting = await greetingServiceFactory().create({
        userId: owner.externalUserId,
        memoryId,
        idempotencyKey,
        memory,
      });
      return json(
        {
          session: {
            id: greeting.sessionId,
            memoryId: greeting.message.memoryId,
            userId: greeting.message.userId,
          },
          greeting: {
            id: greeting.message.id,
            sessionId: greeting.message.sessionId,
            memoryId: greeting.message.memoryId,
            role: greeting.message.role,
            content: greeting.message.content,
            createdAt: greeting.message.createdAt,
          },
          idempotencyKey,
          replayed: greeting.replayed,
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof FirstGreetingInProgressError) {
        return json({ error: "FIRST_GREETING_IN_PROGRESS" }, { status: 409 });
      }
      if (error instanceof FirstGreetingProviderError) {
        return json(
          { error: "AI_UNAVAILABLE" },
          { status: 503 }
        );
      }
      if (error instanceof MemoryValidationError) {
        return json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
      }
      if (error instanceof ChatNotFoundError) {
        return json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
      }
      if (error instanceof DatabaseDependencyError) {
        console.error(
          "[api:first-greeting] database request failed",
          safeDatabaseErrorLog(error)
        );
        return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
      }
      if (error instanceof AuthConfigurationError) {
        return json(
          {
            error:
              error.code === "ORIGIN_NOT_ALLOWED"
                ? "ORIGIN_NOT_ALLOWED"
                : "AUTH_UNAVAILABLE",
          },
          { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 }
        );
      }
      console.error("[api:first-greeting] unexpected request failure");
      return json({ error: "FIRST_GREETING_FAILED" }, { status: 500 });
    }
  };
}
