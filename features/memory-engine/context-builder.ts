import type { MemoryEngineContext, MemoryEngineInput } from "./types";
import {
  MemoryNotFoundError,
  MemoryRepository,
  MemoryService,
  MemorySupabaseDataSource,
} from "../memory";
import {
  ChatRepository,
  ChatService,
  ChatSupabaseDataSource,
} from "../chat";
import { EmotionEngineService } from "../emotion-engine";
import {
  LongTermMemoryRepository,
  LongTermMemoryService,
  LongTermMemorySupabaseDataSource,
} from "../long-term-memory";

const createMemoryService = (): MemoryService => {
  const dataSource = new MemorySupabaseDataSource();
  const repository = new MemoryRepository(dataSource);
  return new MemoryService(repository);
};

const createChatService = (): ChatService => {
  const dataSource = new ChatSupabaseDataSource();
  const repository = new ChatRepository(dataSource);
  return new ChatService(repository);
};

const createLongTermMemoryService = (): LongTermMemoryService => {
  const dataSource = new LongTermMemorySupabaseDataSource();
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
      throw new MemoryNotFoundError(
        "Memory not found: " + input.memoryId
      );
    }

    // TODO: load fragments and timeline from their services

    let recentMessages: { role: string; content: string }[] = [];

    try {
      const fullMessages = await this.chatService.listMessages(input.sessionId);
      const last10 = fullMessages.slice(-10);

      recentMessages = last10.map((m) => ({
        role: m.role,
        content: m.content,
      }));
    } catch {
      // Keep recentMessages as [] — safe degradation
    }

    // Emotion analysis — safe degradation on failure
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
      // Keep defaults — safe degradation
    }

    // Long-term memory recall — safe degradation on failure
    let longTermMemories: string[] = [];

    try {
      const recallResult = await this.ltmService.recallMemory({
        userId: input.userId,
        memoryId: input.memoryId,
        query: input.userMessage,
        topK: 5,
      });

      longTermMemories = recallResult.memories.map((m) => m.content);
    } catch {
      // Keep longTermMemories as [] — safe degradation
    }

    return {
      memoryId: memory.id,
      userId: memory.userId,
      sessionId: input.sessionId,
      userMessage: input.userMessage,
      memoryName: memory.name,
      relationship: memory.relationship,
      lifeStory: memory.lifeStory,
      speechStyle: memory.speechStyle,
      birthYear: memory.birthYear,
      deathYear: memory.deathYear,
      valuesBelief: memory.valuesBelief,
      personalityType: memory.personalityType,
      fragments: [],
      timeline: [],
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
