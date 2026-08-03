import type { ConversationMessage } from "./memoryConversationAdapter";

export type PendingConversationMessage = {
  content: string;
  idempotencyKey: string;
};

/**
 * A repeated sentence is legitimate conversation content.  Recovery therefore
 * identifies an uncertain write by its durable server-issued idempotency key,
 * never by text alone.
 */
export function hasPersistedPendingConversationMessage(
  messages: ConversationMessage[],
  pending: PendingConversationMessage,
): boolean {
  return messages.some((message) => (
    message.role === "user"
    && message.content === pending.content
    && message.metadata?.kind === "memory_chat_turn"
    && message.metadata.idempotencyKey === pending.idempotencyKey
  ));
}
