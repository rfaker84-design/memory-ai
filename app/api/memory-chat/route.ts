import { NextResponse } from "next/server";

import {
  ChatRepository,
  ChatService,
  ChatSupabaseDataSource,
} from "../../../features/chat";
import { MemoryEngineService } from "../../../features/memory-engine";
import { calculateAddictionScore, getCompanionMode } from "../../../src/lib/addiction-score";
import { checkRateLimit } from "../../../src/lib/cost-control";
import { checkConcurrency } from "../../../src/lib/concurrency-control";

type TimelineEvent = {
  event_year?: number | null;
  title?: string;
  description?: string | null;
};

type MemoryChatRequest = {
  memory_id?: string;
  memoryId?: string;
  user_phone?: string;
  phone?: string;
  userId?: string;
  name?: string;
  relationship?: string;
  life_story?: string | null;
  lifeStory?: string | null;
  personality_profile?: string | null;
  personalityProfile?: string | null;
  speech_style?: string | null;
  speechStyle?: string | null;
  catch_phrases?: string | null;
  catchPhrases?: string | null;
  timeline?: TimelineEvent[];
  fragments?: string[];
  history?: { role: string; content: string }[];
  question?: string;
  message?: string;
};

const createChatService = () => {
  const dataSource = new ChatSupabaseDataSource();
  const repository = new ChatRepository(dataSource);

  return new ChatService(repository);
};

const normalizeTimeline = (timeline: TimelineEvent[] | undefined): string[] => {
  if (!Array.isArray(timeline)) return [];

  return timeline
    .map((event) => {
      const year = event.event_year ?? "未知年份";
      const title = event.title?.trim() ?? "";
      const description = event.description?.trim();
      return `${year}：${title}${description ? ` - ${description}` : ""}`.trim();
    })
    .filter(Boolean);
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MemoryChatRequest;

    const memoryId = body.memory_id ?? body.memoryId;
    const userId = body.user_phone ?? body.phone ?? body.userId ?? "anonymous";
    const userMessage = body.question ?? body.message;

    if (!memoryId || !userMessage?.trim()) {
      return NextResponse.json(
        { error: "Missing memoryId or message" },
        { status: 400 }
      );
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
    const conversation = await chatService.getOrCreateConversationByMemory(
      userId,
      memoryId
    );

    await chatService.sendMessage({
      sessionId: conversation.id,
      memoryId,
      userId,
      role: "user",
      content: userMessage,
    });

    const memoryEngine = new MemoryEngineService();
    const engineResponse = await memoryEngine.generateReply({
      userId,
      memoryId,
      sessionId: conversation.id,
      userMessage,
      routeContext: {
        memoryName: body.name,
        relationship: body.relationship,
        lifeStory: body.life_story ?? body.lifeStory,
        personalityProfile: body.personality_profile ?? body.personalityProfile,
        speechStyle: body.speech_style ?? body.speechStyle,
        catchPhrases: body.catch_phrases ?? body.catchPhrases,
        timeline: normalizeTimeline(body.timeline),
        fragments: body.fragments,
        recentMessages: body.history,
      },
    });

    const finalAnswer =
      engineResponse.content?.trim() || "我在。你慢慢说，我听着。";

    await chatService.sendMessage({
      sessionId: conversation.id,
      memoryId,
      userId,
      role: "assistant",
      content: finalAnswer,
    });

    let addictionProfile = null;
    if (userId && userId !== "anonymous") {
      try {
        addictionProfile = await calculateAddictionScore(userId);
      } catch {
        addictionProfile = null;
      }
    }

    return NextResponse.json({
      answer: finalAnswer,
      reply: finalAnswer,
      text: finalAnswer,
      sessionId: conversation.id,
      ...(addictionProfile
        ? {
            addiction_level: addictionProfile.level,
            addiction_score: addictionProfile.score,
            companion_mode: getCompanionMode(addictionProfile.level),
          }
        : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "AI reply failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
