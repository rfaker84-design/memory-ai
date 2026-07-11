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

  console.error("[api:memories] unexpected request failure");
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const memoryService = createMemoryService();
    const memories = await memoryService.listUserMemories(userId);

    return NextResponse.json(memories);
  } catch (error) {
    return databaseErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId ?? body.user_phone;
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

    if (!userId || !name) {
      return NextResponse.json(
        { error: "Missing userId or name" },
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
