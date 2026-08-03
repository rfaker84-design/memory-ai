import type { Memory } from "../../../features/memory/types";

const OWNED_MEMORY_READ_TIMEOUT_MS = 12_000;

export class OwnedMemoryRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

export type OwnedMemoryJsonResponse = {
  response: Response;
  body: unknown;
};

type OwnedMemoryResponseReader<T> = (response: Response, signal: AbortSignal) => Promise<T>;

function errorCodeFromBody(body: unknown, fallback: string): string {
  return typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).error === "string"
    ? (body as Record<string, string>).error
    : fallback;
}

async function boundedOwnedRead<T = Response>(
  input: string,
  signal: AbortSignal | undefined,
  request: typeof fetch,
  timeoutMs: number,
  readResponse?: OwnedMemoryResponseReader<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await request(input, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    return readResponse ? await readResponse(response, controller.signal) : response as T;
  } catch (error) {
    if (timedOut) throw new OwnedMemoryRequestError(408, "MEMORY_READ_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

async function readOwnedJson(response: Response, signal: AbortSignal): Promise<OwnedMemoryJsonResponse> {
  try {
    return { response, body: await response.json() };
  } catch (error) {
    // A malformed body remains a controlled API error. An aborted body must
    // reach boundedOwnedRead so its timeout is not mistaken for invalid JSON.
    if (signal.aborted) throw error;
    return { response, body: {} };
  }
}

/** A bounded cookie-session list read for first-release owner-only surfaces. */
export function fetchOwnedMemoryList(
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = OWNED_MEMORY_READ_TIMEOUT_MS,
): Promise<Response> {
  return boundedOwnedRead("/api/memories", signal, request, timeoutMs);
}

/**
 * Owner-list reads whose consumer needs JSON. Keep the one timeout active for
 * both the connection and body so a stalled response cannot strand recovery UI.
 */
export function fetchOwnedMemoryListJson(
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = OWNED_MEMORY_READ_TIMEOUT_MS,
): Promise<OwnedMemoryJsonResponse> {
  return boundedOwnedRead("/api/memories", signal, request, timeoutMs, readOwnedJson);
}

export async function loadOwnedMemory(
  memoryId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = OWNED_MEMORY_READ_TIMEOUT_MS,
): Promise<Memory> {
  const { response, body } = await boundedOwnedRead(
    `/api/memories/${encodeURIComponent(memoryId)}`,
    signal,
    request,
    timeoutMs,
    readOwnedJson,
  );
  if (!response.ok) {
    throw new OwnedMemoryRequestError(
      response.status,
      errorCodeFromBody(body, "MEMORY_READ_FAILED")
    );
  }
  return body as Memory;
}

export async function loadOwnedMediaUrl(
  assetId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = OWNED_MEMORY_READ_TIMEOUT_MS,
): Promise<string> {
  const { response, body } = await boundedOwnedRead(
    `/api/media/${encodeURIComponent(assetId)}`,
    signal,
    request,
    timeoutMs,
    readOwnedJson,
  );
  const mediaUrl = typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).url === "string"
    ? (body as Record<string, string>).url
    : null;
  if (!response.ok || mediaUrl === null) {
    throw new OwnedMemoryRequestError(
      response.status || 502,
      errorCodeFromBody(body, "MEDIA_READ_FAILED")
    );
  }
  return mediaUrl;
}
