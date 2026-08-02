const PICKUP_INDEX_TIMEOUT_MS = 12_000;

export class PickupIndexRequestError extends Error {
  constructor(readonly code: "PICKUP_INDEX_TIMEOUT") {
    super(code);
  }
}

/**
 * The pickup entry is read-only, but an unbounded initial request can leave a
 * user without a recovery choice. Timeout never writes or retries; it merely
 * returns control to the explicit Retry button.
 */
export async function fetchPickupIndexMemories(
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = PICKUP_INDEX_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await request("/api/memories", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) throw new PickupIndexRequestError("PICKUP_INDEX_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}
