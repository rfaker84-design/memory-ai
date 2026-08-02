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
const CONVERSATION_REQUEST_TIMEOUT_MS = 20_000;

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

/**
 * A client timeout never implies that the server abandoned an idempotent
 * request. Callers must recover the formal conversation before offering a
 * user-controlled retry.
 */
export async function fetchConversationRequest(
  input: string,
  init: RequestInit,
  parentSignal?: AbortSignal,
  timeoutMs = CONVERSATION_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new ConversationRequestError("CHAT_REQUEST_TIMEOUT", 408);
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

export async function loadConversation(
  memoryId: string,
  signal?: AbortSignal
): Promise<ConversationSnapshot> {
  const response = await fetchConversationRequest(`/api/memories/${encodeURIComponent(memoryId)}/chat-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({}),
  }, signal);
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
  const response = await fetchConversationRequest(`/api/memories/${encodeURIComponent(memoryId)}/first-greeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({}),
  }, signal);
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
  const response = await fetchConversationRequest("/api/memory-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      memoryId,
      question: message,
    }),
  }, signal);
  const body = await responseBody(response);
  if (!response.ok) throw toRequestError(body, response.status, "CHAT_SEND_FAILED");
}
