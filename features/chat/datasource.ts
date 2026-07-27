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

export interface ChatDataSource {
  createConversation(input: CreateConversationInput): Promise<Conversation>;
  findConversation(id: string): Promise<Conversation | null>;
  listConversations(userId: string): Promise<Conversation[]>;
  findConversationByMemory(
    userId: string,
    memoryId: string
  ): Promise<Conversation | null>;
  getOrCreateDefaultConversation(
    userId: string,
    memoryId: string
  ): Promise<Conversation>;
  createMessage(input: CreateMessageInput): Promise<Message>;
  listMessages(conversationId: string): Promise<Message[]>;
  claimFirstGreeting?(input: ClaimFirstGreetingInput): Promise<FirstGreetingClaim>;
  completeFirstGreeting?(input: CompleteFirstGreetingInput): Promise<Message>;
  failFirstGreeting?(input: ClaimFirstGreetingInput): Promise<void>;
}
