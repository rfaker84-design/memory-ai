import type { Message } from "../chat";
import { MemoryExtractor } from "./memory-extractor";
import type { LongTermMemoryService } from "./long-term-memory-service";

export interface PersistChatTurnLongTermMemoryInput {
  service: Pick<LongTermMemoryService, "createMemory">;
  extractor?: Pick<MemoryExtractor, "extract">;
  externalUserId: string;
  memoryId: string;
  sessionId: string;
  userMessage: Message;
  assistantMessage: Message;
}

export async function persistChatTurnLongTermMemory(
  input: PersistChatTurnLongTermMemoryInput
): Promise<boolean> {
  const extracted = (input.extractor ?? new MemoryExtractor()).extract({
    userId: input.externalUserId,
    memoryId: input.memoryId,
    sessionId: input.sessionId,
    userMessage: input.userMessage.content,
    assistantMessage: input.assistantMessage.content,
  });
  if (!extracted.shouldRemember || !extracted.content) return false;

  await input.service.createMemory({
    externalUserId: input.externalUserId,
    memoryId: input.memoryId,
    content: extracted.content,
    sourceType: "chat_user_message",
    sourceId: input.userMessage.id,
    importance: extracted.importance,
    tags: extracted.tags,
    metadata: { sessionId: input.sessionId },
  });
  return true;
}
