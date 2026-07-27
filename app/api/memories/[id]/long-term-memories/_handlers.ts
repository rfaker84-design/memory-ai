import { NextRequest, NextResponse } from "next/server";

import {
  LongTermMemoryConflictError,
  LongTermMemoryNotFoundError,
  LongTermMemoryPostgresDataSource,
  LongTermMemoryRepository,
  LongTermMemoryService,
  LongTermMemoryValidationError,
} from "@/features/long-term-memory";
import type { LongTermMemory } from "@/features/long-term-memory";
import { resolveSessionOwner, type SessionResolver } from "@/app/api/memories/_session-user-boundary";
import { AuthConfigurationError, requireAllowedOrigin } from "@/src/server/auth";
import { canAccessInternalBeta } from "@/src/server/beta-access";
import {
  DatabaseDependencyError,
  safeDatabaseErrorLog,
} from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type CollectionContext = { params: Promise<{ id: string }> };
type ItemContext = {
  params: Promise<{ id: string; longTermMemoryId: string }>;
};
type LongTermMemoryBetaService = Pick<
  LongTermMemoryService,
  "listMemories" | "updateMemory" | "deleteMemory"
>;
type ServiceFactory = () => LongTermMemoryBetaService;
type BetaAccess = (externalUserId: string) => boolean;

const createService: ServiceFactory = () =>
  new LongTermMemoryService(
    new LongTermMemoryRepository(new LongTermMemoryPostgresDataSource())
  );

const defaultBetaAccess: BetaAccess = (externalUserId) =>
  canAccessInternalBeta("long-term-memory", externalUserId);

function json(body: Record<string, unknown>, init?: ResponseInit): NextResponse {
  return applyAuthNoStore(NextResponse.json(body, init));
}

function safeMemory(memory: LongTermMemory): LongTermMemory {
  return {
    ...memory,
    metadata: {
      userCorrected: memory.metadata.userCorrected === true,
    },
  };
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof LongTermMemoryValidationError) {
    return json({ error: "INVALID_REQUEST", message: error.message }, { status: 400 });
  }
  if (error instanceof LongTermMemoryNotFoundError) {
    return json({ error: "LONG_TERM_MEMORY_NOT_FOUND" }, { status: 404 });
  }
  if (error instanceof LongTermMemoryConflictError) {
    return json({ error: "LONG_TERM_MEMORY_CONFLICT" }, { status: 409 });
  }
  if (error instanceof DatabaseDependencyError) {
    console.error(
      "[api:long-term-memory-beta] database request failed",
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
  console.error("[api:long-term-memory-beta] unexpected request failure");
  return json({ error: "LONG_TERM_MEMORY_REQUEST_FAILED" }, { status: 500 });
}

function parseUpdateBody(value: unknown): { content: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).length !== 1
    || typeof body.content !== "string"
    || !body.content.trim()
  ) {
    return null;
  }
  return { content: body.content };
}

export function createLongTermMemoryBetaHandlers(
  serviceFactory: ServiceFactory = createService,
  sessionResolver?: SessionResolver,
  betaAccess: BetaAccess = defaultBetaAccess
) {
  async function authorize(request: NextRequest) {
    const owner = await resolveSessionOwner(
      request,
      undefined,
      sessionResolver
    );
    if ("response" in owner) return owner;
    if (!betaAccess(owner.externalUserId)) {
      return { response: json({ error: "BETA_NOT_AVAILABLE" }, { status: 404 }) };
    }
    return owner;
  }

  return {
    async GET(request: NextRequest, context: CollectionContext) {
      const owner = await authorize(request);
      if ("response" in owner) return owner.response;
      try {
        const { id: memoryId } = await context.params;
        const memories = await serviceFactory().listMemories({
          externalUserId: owner.externalUserId,
          memoryId,
          limit: 100,
        });
        return json({ memories: memories.map(safeMemory) });
      } catch (error) {
        return errorResponse(error);
      }
    },

    async PATCH(request: NextRequest, context: ItemContext) {
      const owner = await authorize(request);
      if ("response" in owner) return owner.response;
      try {
        requireAllowedOrigin(request);
        const body = parseUpdateBody(await request.json().catch(() => null));
        if (!body) {
          return json({ error: "INVALID_REQUEST" }, { status: 400 });
        }
        const { id: memoryId, longTermMemoryId } = await context.params;
        const memory = await serviceFactory().updateMemory({
          externalUserId: owner.externalUserId,
          memoryId,
          longTermMemoryId,
          content: body.content,
        });
        return json({ memory: safeMemory(memory) });
      } catch (error) {
        return errorResponse(error);
      }
    },

    async DELETE(request: NextRequest, context: ItemContext) {
      const owner = await authorize(request);
      if ("response" in owner) return owner.response;
      try {
        requireAllowedOrigin(request);
        const { id: memoryId, longTermMemoryId } = await context.params;
        await serviceFactory().deleteMemory({
          externalUserId: owner.externalUserId,
          memoryId,
          longTermMemoryId,
        });
        return applyAuthNoStore(new NextResponse(null, { status: 204 }));
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}
