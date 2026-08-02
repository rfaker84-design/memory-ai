export const PICKUP_REQUEST_TIMEOUT_MS = 12_000;

export class PickupRequestError extends Error {
  constructor(readonly code: "PICKUP_REQUEST_TIMEOUT") {
    super(code);
  }
}

/**
 * First-release pickup and encounter endpoints are owner-scoped, but still
 * need a bounded client wait. A timeout never retries or reports a mutation
 * as successful; callers decide whether to offer an explicit recovery path.
 */
export async function fetchPickupRequest(
  input: string,
  init: RequestInit = {},
  parentSignal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = PICKUP_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const relayAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", relayAbort, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

  try {
    return await request(input, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) throw new PickupRequestError("PICKUP_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", relayAbort);
  }
}
