import type { BaseEvent } from "./event";
import {
  AI_REPLY_GENERATED,
  CHAT_MESSAGE_CREATED,
  MEMORY_CREATED,
  MEMORY_UPDATED,
} from "./event-types";

export interface MemoryCreatedEvent extends BaseEvent {
  eventType: typeof MEMORY_CREATED;
  payload: {
    memoryId: string;
    userId: string;
    name: string;
    relationship: string;
  };
}

export interface MemoryUpdatedEvent extends BaseEvent {
  eventType: typeof MEMORY_UPDATED;
  payload: {
    memoryId: string;
    userId: string;
    changes: Record<string, unknown>;
  };
}

export interface ChatMessageCreatedEvent extends BaseEvent {
  eventType: typeof CHAT_MESSAGE_CREATED;
  payload: {
    messageId: string;
    sessionId: string;
    memoryId: string;
    userId: string;
    role: "user" | "assistant" | "system";
  };
}

export interface AIReplyGeneratedEvent extends BaseEvent {
  eventType: typeof AI_REPLY_GENERATED;
  payload: {
    messageId: string;
    sessionId: string;
    memoryId: string;
    userId: string;
    content: string;
    tokens: number | null;
    provider: string;
  };
}
