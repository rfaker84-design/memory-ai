export const COMPANION_SETTINGS_TIMEOUT_MS = 12_000;

/**
 * Settings are display-only until the server confirms them. Bound the initial
 * read so an interrupted connection cannot leave the consent screen loading
 * forever or imply a consent state that was never received.
 */
export async function fetchCompanionSettings(
  signal?: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = COMPANION_SETTINGS_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await request("/api/consents", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener("abort", relayAbort);
  }
}
