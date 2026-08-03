export const AUTH_REQUEST_TIMEOUT_MS = 12_000;

export class AuthRequestError extends Error {
  constructor(readonly code: "AUTH_REQUEST_TIMEOUT") {
    super(code);
  }
}

export type AuthJsonResponse = { response: Response; body: unknown };

type AuthResponseReader<T> = (response: Response, signal: AbortSignal) => Promise<T>;

/** Auth requests must return control to an explicit user action after timeout. */
async function fetchAuth<T = Response>(
  input: string,
  init: RequestInit,
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
  readResponse?: AuthResponseReader<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const relayAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", relayAbort, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

  try {
    const response = await request(input, { ...init, signal: controller.signal });
    return readResponse ? await readResponse(response, controller.signal) : response as T;
  } catch (error) {
    if (timedOut) throw new AuthRequestError("AUTH_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", relayAbort);
  }
}

async function readAuthJson(response: Response, signal: AbortSignal): Promise<AuthJsonResponse> {
  try {
    return { response, body: await response.json() };
  } catch (error) {
    if (signal.aborted) throw error;
    return { response, body: {} };
  }
}

export function fetchAuthRequest(
  input: string,
  init: RequestInit,
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  return fetchAuth(input, init, request, parentSignal, timeoutMs);
}

export function fetchAuthRequestJson(
  input: string,
  init: RequestInit,
  request: typeof fetch = fetch,
  parentSignal?: AbortSignal,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
): Promise<AuthJsonResponse> {
  return fetchAuth(input, init, request, parentSignal, timeoutMs, readAuthJson);
}
