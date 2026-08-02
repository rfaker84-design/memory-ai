const COMPANION_HOME_TIMEOUT_MS = 12_000;

export class CompanionHomeRequestError extends Error {
  constructor(readonly code: "COMPANION_HOME_TIMEOUT") {
    super(code);
  }
}

/**
 * The companion landing read is deliberately bounded but never retried here:
 * a timed-out owner read cannot establish whether a server response arrived,
 * so retry remains an explicit user action.
 */
export async function fetchCompanionHomeMemories(
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = COMPANION_HOME_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await request("/api/memories", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new CompanionHomeRequestError("COMPANION_HOME_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}
