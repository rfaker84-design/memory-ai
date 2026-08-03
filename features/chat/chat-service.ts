import type { ChatRepository } from "./chat-repository";
import type {
  Conversation,
  CreateConversationInput,
  CreateMessageInput,
  Message,
} from "./types";
import type {
  ClaimFirstGreetingInput,
  CompleteFirstGreetingInput,
  FirstGreetingClaim,
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

  clearMessagesForMemory(userId: string, memoryId: string): Promise<number> {
    return this.chatRepository.clearMessagesForMemory(userId, memoryId);
  }

  claimFirstGreeting(input: ClaimFirstGreetingInput): Promise<FirstGreetingClaim> {
    return this.chatRepository.claimFirstGreeting(input);
  }

  completeFirstGreeting(input: CompleteFirstGreetingInput): Promise<Message> {
    return this.chatRepository.completeFirstGreeting(input);
  }

  failFirstGreeting(input: ClaimFirstGreetingInput): Promise<void> {
    return this.chatRepository.failFirstGreeting(input);
  }

  async getOrCreateConversationByMemory(
    userId: string,
    memoryId: string
  ): Promise<Conversation> {
    return this.chatRepository.getOrCreateDefaultConversation(userId, memoryId);
  }
}
