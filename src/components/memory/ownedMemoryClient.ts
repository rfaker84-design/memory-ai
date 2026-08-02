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

async function boundedOwnedRead(
  input: string,
  signal: AbortSignal | undefined,
  request: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await request(input, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) throw new OwnedMemoryRequestError(408, "MEMORY_READ_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromParent);
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

export async function loadOwnedMemory(
  memoryId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = OWNED_MEMORY_READ_TIMEOUT_MS,
): Promise<Memory> {
  const response = await boundedOwnedRead(
    `/api/memories/${encodeURIComponent(memoryId)}`,
    signal,
    request,
    timeoutMs,
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new OwnedMemoryRequestError(
      response.status,
      typeof body.error === "string" ? body.error : "MEMORY_READ_FAILED"
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
  const response = await boundedOwnedRead(
    `/api/media/${encodeURIComponent(assetId)}`,
    signal,
    request,
    timeoutMs,
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.url !== "string") {
    throw new OwnedMemoryRequestError(
      response.status || 502,
      typeof body.error === "string" ? body.error : "MEDIA_READ_FAILED"
    );
  }
  return body.url;
}
