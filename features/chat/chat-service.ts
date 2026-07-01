import type { ChatRepository } from "./chat-repository";
import type {
  Conversation,
  CreateConversationInput,
  CreateMessageInput,
  Message,
} from "./types";

export class ChatService {
  constructor(private readonly chatRepository: ChatRepository) {}

  createConversation(input: CreateConversationInput): Promise<Conversation> {
    return this.chatRepository.createConversation(input);
  }

  getConversation(id: string): Promise<Conversation | null> {
    return this.chatRepository.getConversation(id);
  }

  listConversations(userId: string): Promise<Conversation[]> {
    return this.chatRepository.listConversations(userId);
  }

  /**
   * Saves a user message. Does NOT call LLM.
   * AI reply is the responsibility of Memory Engine.
   */
  sendMessage(input: CreateMessageInput): Promise<Message> {
    return this.chatRepository.createMessage(input);
  }

  listMessages(conversationId: string): Promise<Message[]> {
    return this.chatRepository.listMessages(conversationId);
  }

  async getOrCreateConversationByMemory(
    userId: string,
    memoryId: string
  ): Promise<Conversation> {
    const existing =
      await this.chatRepository.findConversationByMemory(userId, memoryId);

    if (existing) {
      return existing;
    }

    return this.chatRepository.createConversation({
      userId,
      memoryId,
      title: "默认会话",
    });
  }
}
