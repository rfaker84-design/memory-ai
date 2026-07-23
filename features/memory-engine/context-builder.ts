import type { MemoryEngineContext, MemoryEngineInput } from "./types";
import { MemoryNotFoundError } from "../memory/errors";
import { MemoryPostgresDataSource } from "../memory/memory-postgres-datasource";
import { MemoryRepository } from "../memory/memory-repository";
import { MemoryService } from "../memory/memory-service";
import { ChatPostgresDataSource } from "../chat/chat-postgres-datasource";
import { ChatRepository } from "../chat/chat-repository";
import { ChatService } from "../chat/chat-service";
import { EmotionEngineService } from "../emotion-engine";
import {
  LongTermMemoryPostgresDataSource,
  LongTermMemoryRepository,
  LongTermMemoryService,
} from "../long-term-memory";

const createMemoryService = (): MemoryService => {
  const dataSource = new MemoryPostgresDataSource();
  const repository = new MemoryRepository(dataSource);
  return new MemoryService(repository);
};

const createChatService = (): ChatService => {
  const dataSource = new ChatPostgresDataSource();
  const repository = new ChatRepository(dataSource);
  return new ChatService(repository);
};

const createLongTermMemoryService = (): LongTermMemoryService => {
  const dataSource = new LongTermMemoryPostgresDataSource();
  const repository = new LongTermMemoryRepository(dataSource);
  return new LongTermMemoryService(repository);
};

export class MemoryContextBuilder {
  private memoryService = createMemoryService();
  private chatService = createChatService();
  private emotionEngine = new EmotionEngineService();
  private ltmService = createLongTermMemoryService();

  async buildContext(input: MemoryEngineInput): Promise<MemoryEngineContext> {
    const memory = await this.memoryService.getMemory(input.memoryId);
    if (!memory) {
      throw new MemoryNotFoundError("Memory not found: " + input.memoryId);
    }

    const routeContext = input.routeContext;
    let recentMessages: { role: string; content: string }[] = [];
    try {
      const fullMessages = await this.chatService.listMessages(input.sessionId);
      recentMessages = fullMessages.slice(-10).map((message) => ({
        role: message.role,
        content: message.content,
      }));
      if (recentMessages.length === 0 && routeContext?.recentMessages) {
        recentMessages = routeContext.recentMessages;
      }
    } catch {
      recentMessages = routeContext?.recentMessages ?? [];
    }

    let emotion = "neutral";
    let emotionIntensity = "low";
    let suggestedTone = "温和自然地回应";
    let aiCompanionMode = "guide";
    let aiResponseStyle = "温和自然地回应";
    try {
      const emotionCtx = this.emotionEngine.analyze({
        userId: input.userId,
        memoryId: input.memoryId,
        sessionId: input.sessionId,
        userMessage: input.userMessage,
        recentMessages,
      });
      emotion = emotionCtx.emotion;
      emotionIntensity = emotionCtx.intensity;
      suggestedTone = emotionCtx.suggestedTone;
      if (emotionCtx.aiEmotionState) {
        aiCompanionMode = emotionCtx.aiEmotionState.companionMode;
        aiResponseStyle = emotionCtx.aiEmotionState.responseStyle;
      }
    } catch {
      // Keep safe defaults when emotion analysis is unavailable.
    }

    let longTermMemories: string[] = [];
    try {
      const recallResult = await this.ltmService.recallMemory({
        externalUserId: input.userId,
        memoryId: input.memoryId,
        query: input.userMessage,
        topK: 5,
      });
      longTermMemories = recallResult.memories.map((item) => item.content);
    } catch {
      // Chat remains available when recall is unavailable; it never falls back.
    }

    return {
      memoryId: memory.id,
      userId: memory.userId,
      sessionId: input.sessionId,
      userMessage: input.userMessage,
      memoryName: routeContext?.memoryName || memory.name,
      relationship: routeContext?.relationship || memory.relationship,
      lifeStory: routeContext?.lifeStory ?? memory.lifeStory,
      speechStyle: routeContext?.speechStyle ?? memory.speechStyle,
      personalityProfile: routeContext?.personalityProfile ?? memory.personalityProfile,
      catchPhrases: routeContext?.catchPhrases ?? memory.catchPhrases,
      birthYear: memory.birthYear,
      deathYear: memory.deathYear,
      valuesBelief: memory.valuesBelief,
      personalityType: memory.personalityType,
      fragments: routeContext?.fragments ?? [],
      timeline: routeContext?.timeline ?? [],
      history: [],
      recentMessages,
      emotion,
      emotionIntensity,
      suggestedTone,
      aiCompanionMode,
      aiResponseStyle,
      longTermMemories,
    };
  }
}
