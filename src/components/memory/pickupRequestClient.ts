export const PICKUP_REQUEST_TIMEOUT_MS = 12_000;

export class PickupRequestError extends Error {
  constructor(readonly code: "PICKUP_REQUEST_TIMEOUT") {
    super(code);
  }
}

export type PickupJsonResponse = { response: Response; body: unknown };

type PickupResponseReader<T> = (response: Response, signal: AbortSignal) => Promise<T>;

/**
 * First-release pickup and encounter endpoints are owner-scoped, but still
 * need a bounded client wait. A timeout never retries or reports a mutation
 * as successful; callers decide whether to offer an explicit recovery path.
 */
async function fetchPickup<T = Response>(
  input: string,
  init: RequestInit = {},
  parentSignal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = PICKUP_REQUEST_TIMEOUT_MS,
  readResponse?: PickupResponseReader<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const relayAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", relayAbort, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

  try {
    const response = await request(input, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    return readResponse ? await readResponse(response, controller.signal) : response as T;
  } catch (error) {
    if (timedOut) throw new PickupRequestError("PICKUP_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", relayAbort);
  }
}

async function readPickupJson(response: Response, signal: AbortSignal): Promise<PickupJsonResponse> {
  try {
    return { response, body: await response.json() };
  } catch (error) {
    if (signal.aborted) throw error;
    return { response, body: {} };
  }
}

export function fetchPickupRequest(
  input: string,
  init: RequestInit = {},
  parentSignal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = PICKUP_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  return fetchPickup(input, init, parentSignal, request, timeoutMs);
}

export function fetchPickupRequestJson(
  input: string,
  init: RequestInit = {},
  parentSignal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = PICKUP_REQUEST_TIMEOUT_MS,
): Promise<PickupJsonResponse> {
  return fetchPickup(input, init, parentSignal, request, timeoutMs, readPickupJson);
}
