import { NextRequest } from "next/server";

import { MemoryPostgresDataSource } from "../../../../features/memory/memory-postgres-datasource";
import { MemoryRepository } from "../../../../features/memory/memory-repository";
import { MemoryService } from "../../../../features/memory/memory-service";
import { MemoryValidationError } from "../../../../features/memory/errors";
import { isMemoryCreationIdempotencyKey } from "../../../../features/memory/memory-idempotency";
import {
  applyAuthNoStore,
  AuthConfigurationError,
  authJson,
  requireAllowedOrigin,
} from "../../../../src/server/auth";
import {
  DatabaseDependencyError,
  safeDatabaseErrorLog,
} from "../../../../src/server/database";
import {
  resolveSessionOwner,
  type SessionResolver,
} from "../_session-user-boundary";

type MemoryRecoveryService = Pick<MemoryService, "recoverCreatedMemory">;
type MemoryRecoveryServiceFactory = () => MemoryRecoveryService;

const createMemoryRecoveryService: MemoryRecoveryServiceFactory = () =>
  new MemoryService(new MemoryRepository(new MemoryPostgresDataSource()));

function isEmptyObject(value: unknown): value is Record<string, never> {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).length === 0
  );
}

function errorResponse(error: unknown) {
  if (error instanceof MemoryValidationError) {
    return authJson({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
  }

  if (error instanceof DatabaseDependencyError) {
    console.error(
      "[api:memories:recovery] database request failed",
      safeDatabaseErrorLog(error)
    );
    return authJson(
      { error: "DATABASE_DEPENDENCY_UNAVAILABLE" },
      { status: 503 }
    );
  }

  if (error instanceof AuthConfigurationError) {
    const originDenied = error.code === "ORIGIN_NOT_ALLOWED";
    return authJson(
      { error: originDenied ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" },
      { status: originDenied ? 403 : 503 }
    );
  }

  console.error("[api:memories:recovery] unexpected request failure");
  return authJson({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
}

export function createMemoryRecoveryHandler(
  serviceFactory: MemoryRecoveryServiceFactory = createMemoryRecoveryService,
  sessionResolver?: SessionResolver
) {
  return async function POST(request: NextRequest) {
    try {
      requireAllowedOrigin(request);

      const owner = await resolveSessionOwner(
        request,
        undefined,
        sessionResolver
      );
      if ("response" in owner) {
        return applyAuthNoStore(owner.response);
      }

      const idempotencyKey = request.headers.get("idempotency-key");
      if (!idempotencyKey) {
        return authJson(
          { error: "IDEMPOTENCY_KEY_REQUIRED" },
          { status: 400 }
        );
      }
      if (!isMemoryCreationIdempotencyKey(idempotencyKey)) {
        return authJson(
          { error: "INVALID_IDEMPOTENCY_KEY" },
          { status: 400 }
        );
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return authJson({ error: "INVALID_REQUEST_BODY" }, { status: 400 });
      }
      if (!isEmptyObject(body)) {
        return authJson({ error: "INVALID_REQUEST_BODY" }, { status: 400 });
      }

      const memory = await serviceFactory().recoverCreatedMemory(
        owner.externalUserId,
        idempotencyKey
      );
      if (!memory) {
        return authJson({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
      }

      return authJson(memory);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
