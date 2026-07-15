import { NextRequest, NextResponse } from "next/server";

import {
  ChatPostgresDataSource,
  ChatRepository,
  ChatService,
} from "../../../features/chat";
import { MemoryEngineService } from "../../../features/memory-engine";
import { MemoryPostgresDataSource } from "../../../features/memory/memory-postgres-datasource";
import { MemoryRepository } from "../../../features/memory/memory-repository";
import { MemoryService } from "../../../features/memory/memory-service";
import {
  AuthConfigurationError,
  requireAllowedOrigin,
  verifyRequestSession,
} from "../../../src/server/auth";
import { calculateAddictionScore, getCompanionMode } from "../../../src/lib/addiction-score";
import { checkConcurrency } from "../../../src/lib/concurrency-control";
import { checkRateLimit } from "../../../src/lib/cost-control";

type MemoryChatRequest = {
  memory_id?: string;
  memoryId?: string;
  user_phone?: string;
  phone?: string;
  userId?: string;
  fragments?: string[];
  history?: { role: string; content: string }[];
  question?: string;
  message?: string;
};

const createChatService = () =>
  new ChatService(new ChatRepository(new ChatPostgresDataSource()));

const createMemoryService = () =>
  new MemoryService(new MemoryRepository(new MemoryPostgresDataSource()));

export async function POST(request: NextRequest) {
  try {
    const session = await verifyRequestSession(request);
    if (!session) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    requireAllowedOrigin(request);

    const body = (await request.json()) as MemoryChatRequest;
    const memoryId = body.memory_id ?? body.memoryId;
    const userMessage = body.question ?? body.message;
    const compatibilityUserId = body.user_phone ?? body.phone ?? body.userId;
    if (compatibilityUserId !== undefined && compatibilityUserId !== session.externalUserId) {
      return NextResponse.json({ error: "SESSION_USER_MISMATCH" }, { status: 403 });
    }
    if (!memoryId || !userMessage?.trim()) {
      return NextResponse.json({ error: "Missing memoryId or message" }, { status: 400 });
    }

    const userId = session.externalUserId;
    const memory = await createMemoryService().getMemoryForUser(memoryId, userId);
    if (!memory) {
      return NextResponse.json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
    }

    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) {
      const answer = "TA需要休息一下，我们稍后再见。";
      return NextResponse.json({ answer, reply: answer, text: answer });
    }
    const concurrencyCheck = checkConcurrency(userId, "ai");
    if (!concurrencyCheck.allowed) {
      const answer = "让我缓一缓，马上就好。";
      return NextResponse.json({ answer, reply: answer, text: answer });
    }

    const chatService = createChatService();
    const conversation = await chatService.getOrCreateConversationByMemory(userId, memoryId);
    await chatService.sendMessage({
      sessionId: conversation.id,
      memoryId,
      userId,
      role: "user",
      content: userMessage,
    });

    const engineResponse = await new MemoryEngineService().generateReply({
      userId,
      memoryId,
      sessionId: conversation.id,
      userMessage,
      routeContext: {
        memoryName: memory.name,
        relationship: memory.relationship,
        lifeStory: memory.lifeStory,
        personalityProfile: memory.personalityProfile,
        speechStyle: memory.speechStyle,
        catchPhrases: memory.catchPhrases,
        fragments: body.fragments,
        recentMessages: body.history,
      },
    });
    const finalAnswer = engineResponse.content?.trim() || "我在。你慢慢说，我听着。";
    await chatService.sendMessage({
      sessionId: conversation.id,
      memoryId,
      userId,
      role: "assistant",
      content: finalAnswer,
    });

    let addictionProfile = null;
    try {
      addictionProfile = await calculateAddictionScore(userId);
    } catch {
      addictionProfile = null;
    }

    return NextResponse.json({
      answer: finalAnswer,
      reply: finalAnswer,
      text: finalAnswer,
      sessionId: conversation.id,
      ...(addictionProfile ? {
        addiction_level: addictionProfile.level,
        addiction_score: addictionProfile.score,
        companion_mode: getCompanionMode(addictionProfile.level),
      } : {}),
    });
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return NextResponse.json(
        { error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" },
        { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 }
      );
    }
    return NextResponse.json({ error: "CHAT_REQUEST_FAILED" }, { status: 500 });
  }
}
