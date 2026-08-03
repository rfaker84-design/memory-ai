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

type OwnedFirstPresenceVideo = {
  intent?: unknown;
  status?: unknown;
  artifactAvailable?: unknown;
};

export class ConversationRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string
  ) {
    super(message);
    this.name = "ConversationRequestError";
  }
}

type UnknownRecord = Record<string, unknown>;
const CONVERSATION_REQUEST_TIMEOUT_MS = 20_000;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function responseRequestId(response: Response): string | undefined {
  const requestId = response.headers.get("x-request-id")?.trim();
  return requestId && REQUEST_ID_PATTERN.test(requestId) ? requestId.toLowerCase() : undefined;
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

function toRequestError(response: Response, body: UnknownRecord, fallback: string) {
  return new ConversationRequestError(
    typeof body.error === "string" ? body.error : fallback,
    response.status,
    responseRequestId(response),
  );
}

/**
 * A client timeout never implies that the server abandoned an idempotent
 * request. Callers must recover the formal conversation before offering a
 * user-controlled retry.
 */
async function withConversationRequestTimeout<T>(
  input: string,
  init: RequestInit,
  parentSignal?: AbortSignal,
  timeoutMs = CONVERSATION_REQUEST_TIMEOUT_MS,
  consume?: (response: Response, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return await (consume ? consume(response, controller.signal) : Promise.resolve(response as T));
  } catch (error) {
    if (timedOut) throw new ConversationRequestError("CHAT_REQUEST_TIMEOUT", 408);
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

/**
 * Bounds the request handshake. Callers that consume a JSON response body must
 * use fetchConversationJson so the same timeout also covers a stalled body.
 */
export async function fetchConversationRequest(
  input: string,
  init: RequestInit,
  parentSignal?: AbortSignal,
  timeoutMs = CONVERSATION_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  return withConversationRequestTimeout<Response>(input, init, parentSignal, timeoutMs);
}

/**
 * Formal conversation reads and mutations are bounded across both connection
 * and JSON-body consumption. A timeout remains uncertain for mutations: this
 * helper never retries or treats a partial body as success.
 */
export async function fetchConversationJson(
  input: string,
  init: RequestInit,
  parentSignal?: AbortSignal,
  timeoutMs = CONVERSATION_REQUEST_TIMEOUT_MS,
): Promise<{ response: Response; body: UnknownRecord }> {
  return withConversationRequestTimeout(input, init, parentSignal, timeoutMs, async (response, signal) => {
    try {
      return { response, body: asRecord(await response.json()) };
    } catch (error) {
      if (signal.aborted) throw error;
      // Preserve the existing formal contract for a non-JSON error response.
      return { response, body: {} };
    }
  });
}

export async function loadConversation(
  memoryId: string,
  signal?: AbortSignal
): Promise<ConversationSnapshot> {
  const { response, body } = await fetchConversationJson(`/api/memories/${encodeURIComponent(memoryId)}/chat-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({}),
  }, signal);
  if (!response.ok) throw toRequestError(response, body, "CHAT_SESSION_FAILED");
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
  const { response, body } = await fetchConversationJson(`/api/memories/${encodeURIComponent(memoryId)}/first-greeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({}),
  }, signal);
  if (!response.ok) throw toRequestError(response, body, "FIRST_GREETING_FAILED");
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
): Promise<{ freeChatWarning: boolean }> {
  const { response, body } = await fetchConversationJson("/api/memory-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      memoryId,
      question: message,
    }),
  }, signal);
  if (!response.ok) throw toRequestError(response, body, "CHAT_SEND_FAILED");
  return { freeChatWarning: body.freeChatWarning === true };
}

/**
 * Notification permission is only a presentation opt-in. The eligibility
 * predicate is nevertheless read from the formal owner-only video route so a
 * browser cache cannot claim that a first preview completed.
 */
export async function hasCompletedInitialPreview(
  memoryId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const { response, body } = await fetchConversationJson(
    `/api/memories/${encodeURIComponent(memoryId)}/first-presence-video`,
    { method: "GET", credentials: "same-origin", cache: "no-store" },
    signal,
  );
  if (!response.ok) throw toRequestError(response, body, "FIRST_PRESENCE_VIDEO_STATUS_FAILED");
  const jobs = Array.isArray(body.jobs) ? body.jobs as OwnedFirstPresenceVideo[] : [];
  return jobs.some((job) =>
    job.intent === "initial_preview"
    && job.status === "succeeded"
    && job.artifactAvailable === true,
  );
}
