export const COMPANION_SETTINGS_TIMEOUT_MS = 12_000;

export type CompanionSettingsJsonResponse = { response: Response; body: unknown };

type CompanionSettingsReader<T> = (response: Response, signal: AbortSignal) => Promise<T>;

/**
 * Settings are display-only until the server confirms them. Bound the initial
 * read so an interrupted connection cannot leave the consent screen loading
 * forever or imply a consent state that was never received.
 */
async function fetchSettings<T = Response>(
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = COMPANION_SETTINGS_TIMEOUT_MS,
  readResponse?: CompanionSettingsReader<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

  try {
    const response = await request("/api/consents", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    return readResponse ? await readResponse(response, controller.signal) : response as T;
  } catch (error) {
    if (timedOut) throw new Error("COMPANION_SETTINGS_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener("abort", relayAbort);
  }
}

async function readSettingsJson(response: Response, signal: AbortSignal): Promise<CompanionSettingsJsonResponse> {
  try {
    return { response, body: await response.json() };
  } catch (error) {
    if (signal.aborted) throw error;
    return { response, body: {} };
  }
}

export function fetchCompanionSettings(
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = COMPANION_SETTINGS_TIMEOUT_MS,
): Promise<Response> {
  return fetchSettings(signal, request, timeoutMs);
}

export function fetchCompanionSettingsJson(
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = COMPANION_SETTINGS_TIMEOUT_MS,
): Promise<CompanionSettingsJsonResponse> {
  return fetchSettings(signal, request, timeoutMs, readSettingsJson);
}
