import { NextRequest, NextResponse } from "next/server";

import {
  MemoryRepository,
  MemoryService,
  MemorySupabaseDataSource,
} from "../../../features/memory";
import { AuditService, AuditRepository, AuditSupabaseDataSource } from "../../../features/audit";


const createMemoryService = () => {
  const dataSource = new MemorySupabaseDataSource();
  const repository = new MemoryRepository(dataSource);

  return new MemoryService(repository);
};

const createAuditService = () =>
  new AuditService(new AuditRepository(new AuditSupabaseDataSource()));

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
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
        message: "创建记忆成功",
        metadata: { name, relationship },
      });
    } catch (e) {
      console.warn("audit memory.created failed:", e);
    }

    return NextResponse.json(memory);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
