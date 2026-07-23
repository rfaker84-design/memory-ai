export function hasChatBoxMemoryId(memoryId: unknown): memoryId is string {
  return typeof memoryId === "string" && memoryId.trim().length > 0;
}

export function createChatBoxIdempotencyKey() {
  const random = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `chatbox-${random}`;
}

export function buildChatBoxMemoryChatRequest(
  memoryId: string,
  question: string,
  idempotencyKey: string
): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    credentials: "same-origin",
    body: JSON.stringify({ memoryId, question }),
  };
}

export type PendingChatBoxMessage = {
  memoryId: string;
  question: string;
  idempotencyKey: string;
};

export function preparePendingChatBoxMessage(
  current: PendingChatBoxMessage | null,
  memoryId: string,
  question: string
): PendingChatBoxMessage {
  if (current?.memoryId === memoryId && current.question === question) return current;
  return { memoryId, question, idempotencyKey: createChatBoxIdempotencyKey() };
}

export function retainPendingChatBoxMessage(
  pending: PendingChatBoxMessage
): PendingChatBoxMessage {
  return pending;
}

export function clearPendingChatBoxMessage(): null {
  return null;
}

export function chatSessionConfirmsPendingMessage(
  messages: unknown,
  pending: PendingChatBoxMessage
): boolean {
  return Array.isArray(messages) && messages.some((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) return false;
    const record = message as Record<string, unknown>;
    return record.role === "user" && record.content === pending.question && record.memoryId === pending.memoryId;
  });
}
