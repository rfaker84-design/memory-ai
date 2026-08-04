import type { Conversation, Message } from "./types";

export type MemoryChatTurnClaimStatus = "claimed" | "replayed" | "in_progress";

export interface ClaimMemoryChatTurnInput {
  userId: string;
  memoryId: string;
  idempotencyKey: string;
  question: string;
}

export interface CompleteMemoryChatTurnInput extends ClaimMemoryChatTurnInput {
  conversationId: string;
  answer: string;
  /** Owner-safe metadata for the assistant message, persisted for replay. */
  assistantMetadata?: Record<string, unknown>;
}

export interface MemoryChatTurnResult {
  conversation: Conversation;
  userMessage: Message;
  assistantMessage: Message;
}

export interface MemoryChatTurnClaim {
  status: MemoryChatTurnClaimStatus;
  conversation: Conversation;
  result?: MemoryChatTurnResult;
}
