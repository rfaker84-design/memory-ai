export const AUTH_REQUEST_TIMEOUT_MS = 12_000;

export class AuthRequestError extends Error {
  constructor(readonly code: "AUTH_REQUEST_TIMEOUT") {
    super(code);
  }
}

/** Auth requests must return control to an explicit user action after timeout. */
export async function fetchAuthRequest(
  input: string,
  init: RequestInit,
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const relayAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", relayAbort, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

  try {
    return await request(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new AuthRequestError("AUTH_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", relayAbort);
  }
}
