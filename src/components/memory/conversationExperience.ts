export type PersistedConversationMessage = {
  id?: string;
  sessionId?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown> | null;
};

function persistedTurnIdentity(
  message: PersistedConversationMessage,
  activeSessionId: string,
) {
  if (message.sessionId !== activeSessionId) return null;
  if (!message.id?.trim() || !message.content.trim()) return null;
  if (message.metadata?.kind !== "memory_chat_turn") return null;
  const idempotencyKey = message.metadata.idempotencyKey;
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) return null;
  return `${activeSessionId}\u0000${idempotencyKey}`;
}

export function hasPersistedFirstGreeting(messages: PersistedConversationMessage[]): boolean {
  return messages.some((message) => (
    message.role === "assistant"
    && Boolean(message.id?.trim())
    && Boolean(message.sessionId?.trim())
    && Boolean(message.content.trim())
    && message.metadata?.kind === "first_greeting"
  ));
}

/**
 * Counts only complete, persisted memory-chat turns.
 *
 * The formal chat persistence layer writes the user message and assistant reply
 * with the same session id and idempotency key. Both messages must also belong
 * to the chat-session currently returned to the caller. Requiring that explicit
 * session excludes stale conversations as well as the first greeting, optimistic
 * UI, preview copy, blank replies and incomplete or failed turns.
 */
export function completedConversationRounds(
  messages: PersistedConversationMessage[],
  activeSessionId: string | null | undefined,
): number {
  if (!activeSessionId?.trim()) return 0;

  const pendingUserTurns = new Set<string>();
  const completedTurns = new Set<string>();

  for (const message of messages) {
    const identity = persistedTurnIdentity(message, activeSessionId);
    if (!identity) continue;

    if (message.role === "user") {
      if (!completedTurns.has(identity)) pendingUserTurns.add(identity);
      continue;
    }

    if (
      message.role === "assistant"
      && pendingUserTurns.has(identity)
      && !completedTurns.has(identity)
    ) {
      pendingUserTurns.delete(identity);
      completedTurns.add(identity);
    }
  }

  return completedTurns.size;
}
