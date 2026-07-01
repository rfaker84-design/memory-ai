import type { ChatDataSource } from "./datasource";
import type {
  Conversation,
  CreateConversationInput,
  CreateMessageInput,
  Message,
} from "./types";

export class ChatRepository {
  constructor(private readonly dataSource: ChatDataSource) {}

  createConversation(input: CreateConversationInput): Promise<Conversation> {
    return this.dataSource.createConversation(input);
  }

  getConversation(id: string): Promise<Conversation | null> {
    return this.dataSource.findConversation(id);
  }

  listConversations(userId: string): Promise<Conversation[]> {
    return this.dataSource.listConversations(userId);
  }

  findConversationByMemory(
    userId: string,
    memoryId: string
  ): Promise<Conversation | null> {
    return this.dataSource.findConversationByMemory(userId, memoryId);
  }

  createMessage(input: CreateMessageInput): Promise<Message> {
    return this.dataSource.createMessage(input);
  }

  listMessages(conversationId: string): Promise<Message[]> {
    return this.dataSource.listMessages(conversationId);
  }
}
