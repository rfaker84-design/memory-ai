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
