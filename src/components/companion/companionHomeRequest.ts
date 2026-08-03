const COMPANION_HOME_TIMEOUT_MS = 12_000;

export class CompanionHomeRequestError extends Error {
  constructor(readonly code: "COMPANION_HOME_TIMEOUT") {
    super(code);
  }
}

export type CompanionHomeJsonResponse = { response: Response; body: unknown };

type CompanionHomeReader<T> = (response: Response, signal: AbortSignal) => Promise<T>;

/**
 * The companion landing read is deliberately bounded but never retried here:
 * a timed-out owner read cannot establish whether a server response arrived,
 * so retry remains an explicit user action.
 */
async function fetchCompanionHome<T = Response>(
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = COMPANION_HOME_TIMEOUT_MS,
  readResponse?: CompanionHomeReader<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await request("/api/memories", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
    return readResponse ? await readResponse(response, controller.signal) : response as T;
  } catch (error) {
    if (timedOut) throw new CompanionHomeRequestError("COMPANION_HOME_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

async function readCompanionHomeJson(response: Response, signal: AbortSignal): Promise<CompanionHomeJsonResponse> {
  try {
    return { response, body: await response.json() };
  } catch (error) {
    if (signal.aborted) throw error;
    return { response, body: {} };
  }
}

export function fetchCompanionHomeMemories(
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = COMPANION_HOME_TIMEOUT_MS,
): Promise<Response> {
  return fetchCompanionHome(request, parentSignal, timeoutMs);
}

export function fetchCompanionHomeMemoriesJson(
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = COMPANION_HOME_TIMEOUT_MS,
): Promise<CompanionHomeJsonResponse> {
  return fetchCompanionHome(request, parentSignal, timeoutMs, readCompanionHomeJson);
}
