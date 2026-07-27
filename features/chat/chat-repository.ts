import type { ChatDataSource } from "./datasource";
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
import { ChatValidationError } from "./errors";

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

  getOrCreateDefaultConversation(
    userId: string,
    memoryId: string
  ): Promise<Conversation> {
    return this.dataSource.getOrCreateDefaultConversation(userId, memoryId);
  }

  createMessage(input: CreateMessageInput): Promise<Message> {
    return this.dataSource.createMessage(input);
  }

  listMessages(conversationId: string): Promise<Message[]> {
    return this.dataSource.listMessages(conversationId);
  }

  claimFirstGreeting(input: ClaimFirstGreetingInput): Promise<FirstGreetingClaim> {
    if (!this.dataSource.claimFirstGreeting) {
      throw new ChatValidationError(
        "First greetings require the formal PostgreSQL datasource"
      );
    }
    return this.dataSource.claimFirstGreeting(input);
  }

  completeFirstGreeting(input: CompleteFirstGreetingInput): Promise<Message> {
    if (!this.dataSource.completeFirstGreeting) {
      throw new ChatValidationError(
        "First greetings require the formal PostgreSQL datasource"
      );
    }
    return this.dataSource.completeFirstGreeting(input);
  }

  failFirstGreeting(input: ClaimFirstGreetingInput): Promise<void> {
    if (!this.dataSource.failFirstGreeting) {
      throw new ChatValidationError(
        "First greetings require the formal PostgreSQL datasource"
      );
    }
    return this.dataSource.failFirstGreeting(input);
  }
}
