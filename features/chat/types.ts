export interface Conversation {
  id: string;
  memoryId: string;
  userId: string;
  title: string | null;
  summary: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string | null;
  memoryId: string;
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CreateConversationInput {
  memoryId: string;
  userId: string;
  title?: string;
  summary?: string;
}

export interface CreateMessageInput {
  sessionId: string;
  memoryId: string;
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens?: number;
  metadata?: Record<string, unknown>;
}

export type FirstGreetingClaimStatus = "claimed" | "replayed" | "in_progress";

export interface ClaimFirstGreetingInput {
  userId: string;
  memoryId: string;
  idempotencyKey: string;
}

export interface CompleteFirstGreetingInput extends ClaimFirstGreetingInput {
  conversationId: string;
  content: string;
}

export interface FirstGreetingClaim {
  status: FirstGreetingClaimStatus;
  conversation: Conversation;
  message?: Message;
}
