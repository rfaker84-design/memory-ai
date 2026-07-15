import { NextRequest, NextResponse } from "next/server";

import { MemoryPostgresDataSource } from "../../../features/memory/memory-postgres-datasource";
import { MemoryRepository } from "../../../features/memory/memory-repository";
import { MemoryService } from "../../../features/memory/memory-service";
import { AuditPostgresDataSource } from "../../../features/audit/audit-postgres-datasource";
import { AuditRepository } from "../../../features/audit/audit-repository";
import { AuditService } from "../../../features/audit/audit-service";
import {
  DatabaseDependencyError,
  safeDatabaseErrorLog,
} from "../../../src/server/database";
import { MemoryValidationError } from "../../../features/memory/errors";
import {
  AuthConfigurationError,
  requireAllowedOrigin,
} from "../../../src/server/auth";
import { resolveSessionOwner } from "./_session-user-boundary";


const createMemoryService = () => {
  const dataSource = new MemoryPostgresDataSource();
  const repository = new MemoryRepository(dataSource);

  return new MemoryService(repository);
};

const createAuditService = () =>
  new AuditService(new AuditRepository(new AuditPostgresDataSource()));

function databaseErrorResponse(error: unknown) {
  if (error instanceof MemoryValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof DatabaseDependencyError) {
    console.error("[api:memories] database request failed", safeDatabaseErrorLog(error));
    return NextResponse.json(
      { error: "Database dependency unavailable" },
      { status: 503 }
    );
  }

  if (error instanceof AuthConfigurationError) {
    return NextResponse.json(
      { error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" },
      { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 }
    );
  }

  console.error("[api:memories] unexpected request failure");
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const owner = await resolveSessionOwner(
      req,
      req.nextUrl.searchParams.has("userId")
        ? req.nextUrl.searchParams.get("userId")
        : undefined
    );
    if ("response" in owner) return owner.response;
    const memoryService = createMemoryService();
    const memories = await memoryService.listUserMemories(owner.externalUserId);

    return NextResponse.json(memories);
  } catch (error) {
    return databaseErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    requireAllowedOrigin(req);
    const body = await req.json();
    const compatibilityUserId = body.userId ?? body.user_phone;
    const owner = await resolveSessionOwner(req, compatibilityUserId);
    if ("response" in owner) return owner.response;
    const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;
    const userId = owner.externalUserId;
    const {
      name,
      relationship,
      lifeStory,
      life_story,
      personalityProfile,
      personality_profile,
      speechStyle,
      speech_style,
      catchPhrases,
      catch_phrases,
      photoUrl,
      photo_url,
      personalityTags,
      personality_tags,
      fragments,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Missing name" },
        { status: 400 }
      );
    }

    const memoryService = createMemoryService();
    const memory = await memoryService.createMemory({
      userId,
      name,
      relationship: relationship ?? "",
      lifeStory: lifeStory ?? life_story ?? null,
      personalityProfile: personalityProfile ?? personality_profile ?? null,
      speechStyle: speechStyle ?? speech_style ?? null,
      catchPhrases: catchPhrases ?? catch_phrases ?? null,
      photoUrl: photoUrl ?? photo_url ?? null,
      personalityTags: personalityTags ?? personality_tags ?? null,
      fragments,
      idempotencyKey,
    });

    try {
      await createAuditService().log({
        userId,
        memoryId: memory.id,
        action: "memory.created",
        level: "info",
        message: "Memory created",
        metadata: { name, relationship },
      });
    } catch (error) {
      console.warn(
        "[api:memories] audit memory.created failed",
        safeDatabaseErrorLog(error)
      );
    }

    return NextResponse.json(memory);
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
