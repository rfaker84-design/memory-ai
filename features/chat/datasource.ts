import type {
  Conversation,
  CreateConversationInput,
  CreateMessageInput,
  Message,
} from "./types";

export interface ChatDataSource {
  createConversation(input: CreateConversationInput): Promise<Conversation>;
  findConversation(id: string): Promise<Conversation | null>;
  listConversations(userId: string): Promise<Conversation[]>;
  findConversationByMemory(
    userId: string,
    memoryId: string
  ): Promise<Conversation | null>;
  createMessage(input: CreateMessageInput): Promise<Message>;
  listMessages(conversationId: string): Promise<Message[]>;
}
