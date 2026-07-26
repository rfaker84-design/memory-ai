import { hasPersistedFirstGreeting } from "../memory/conversationExperience";

export type ConversationMessage = {
  id: string;
  sessionId: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt?: string;
};

export type ConversationSnapshot = {
  sessionId: string;
  messages: ConversationMessage[];
};

export class ConversationRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ConversationRequestError";
  }
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

async function responseBody(response: Response): Promise<UnknownRecord> {
  return asRecord(await response.json().catch(() => ({})));
}

function normalizeMessage(value: unknown, index: number): ConversationMessage | null {
  const message = asRecord(value);
  const role = message.role;
  const content = message.content;
  if ((role !== "user" && role !== "assistant" && role !== "system") || typeof content !== "string") return null;
  return {
    id: typeof message.id === "string" ? message.id : `server-${index}`,
    sessionId: typeof message.sessionId === "string" ? message.sessionId : null,
    role,
    content,
    metadata: asRecord(message.metadata),
    createdAt: typeof message.createdAt === "string" ? message.createdAt : undefined,
  };
}

function toRequestError(body: UnknownRecord, status: number, fallback: string) {
  return new ConversationRequestError(
    typeof body.error === "string" ? body.error : fallback,
    status
  );
}

export async function loadConversation(
  memoryId: string,
  signal?: AbortSignal
): Promise<ConversationSnapshot> {
  const response = await fetch(`/api/memories/${encodeURIComponent(memoryId)}/chat-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({}),
    signal,
  });
  const body = await responseBody(response);
  if (!response.ok) throw toRequestError(body, response.status, "CHAT_SESSION_FAILED");
  const session = asRecord(body.session);
  const messages = Array.isArray(body.messages)
    ? body.messages.map(normalizeMessage).filter((message): message is ConversationMessage => Boolean(message))
    : [];
  if (typeof session.id !== "string") throw new ConversationRequestError("CHAT_SESSION_INVALID", 502);
  return { sessionId: session.id, messages };
}

export async function requestFirstGreeting(
  memoryId: string,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<ConversationMessage> {
  const response = await fetch(`/api/memories/${encodeURIComponent(memoryId)}/first-greeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({}),
    signal,
  });
  const body = await responseBody(response);
  if (!response.ok) throw toRequestError(body, response.status, "FIRST_GREETING_FAILED");
  const greeting = normalizeMessage(body.greeting, 0);
  if (!greeting || greeting.role !== "assistant") {
    throw new ConversationRequestError("FIRST_GREETING_INVALID", 502);
  }
  return greeting;
}

export async function restoreConversationWithFirstGreeting(
  memoryId: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ConversationSnapshot> {
  const restored = await loadConversation(memoryId, signal);
  if (hasPersistedFirstGreeting(restored.messages)) return restored;
  await requestFirstGreeting(memoryId, idempotencyKey, signal);
  return loadConversation(memoryId, signal);
}

export async function sendConversationMessage(
  memoryId: string,
  message: string,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch("/api/memory-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      memoryId,
      question: message,
    }),
    signal,
  });
  const body = await responseBody(response);
  if (!response.ok) throw toRequestError(body, response.status, "CHAT_SEND_FAILED");
}
