const PROFILE_TIMEOUT_MS = 12_000;

export class AccountProfileRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type AdultProfile = { birthDate: string | null; adultEligible: boolean };

type ProfileResponseReader<T> = (response: Response, signal: AbortSignal) => Promise<T>;

async function request<T>(
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
  readResponse: ProfileResponseReader<T>,
  timeoutMs = PROFILE_TIMEOUT_MS,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const relayAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", relayAbort, { once: true });
  const timeout = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetcher(path, { ...init, credentials: "same-origin", signal: controller.signal });
    return await readResponse(response, controller.signal);
  } catch (error) {
    if (timedOut) throw new AccountProfileRequestError("PROFILE_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", relayAbort);
  }
}

async function parseProfile(response: Response, signal: AbortSignal): Promise<AdultProfile> {
  let body: Record<string, unknown> | null;
  try {
    body = await response.json() as Record<string, unknown>;
  } catch (error) {
    if (signal.aborted) throw error;
    body = null;
  }
  if (!response.ok) {
    const code = body && "error" in body && typeof body.error === "string" ? body.error : "PROFILE_REQUEST_FAILED";
    throw new AccountProfileRequestError(code);
  }
  if (!body || (body.birthDate !== null && typeof body.birthDate !== "string") || typeof body.adultEligible !== "boolean") {
    throw new AccountProfileRequestError("PROFILE_RESPONSE_INVALID");
  }
  return { birthDate: body.birthDate as string | null, adultEligible: body.adultEligible };
}

export function readAdultProfile(fetcher: typeof fetch = fetch, timeoutMs = PROFILE_TIMEOUT_MS, parentSignal?: AbortSignal) {
  return request("/api/account/profile", { cache: "no-store" }, fetcher, parseProfile, timeoutMs, parentSignal);
}

export function saveAdultBirthDate(birthDate: string, fetcher: typeof fetch = fetch, timeoutMs = PROFILE_TIMEOUT_MS, parentSignal?: AbortSignal) {
  return request("/api/account/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ birthDate }),
  }, fetcher, parseProfile, timeoutMs, parentSignal);
}
