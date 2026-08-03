const PROFILE_TIMEOUT_MS = 12_000;

export class AccountProfileRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type AdultProfile = { birthDate: string | null; adultEligible: boolean };

async function request(path: string, init: RequestInit, fetcher: typeof fetch): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);
  try {
    return await fetcher(path, { ...init, credentials: "same-origin", signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new AccountProfileRequestError("PROFILE_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function parseProfile(response: Response): Promise<AdultProfile> {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const code = body && "error" in body && typeof body.error === "string" ? body.error : "PROFILE_REQUEST_FAILED";
    throw new AccountProfileRequestError(code);
  }
  if (!body || (body.birthDate !== null && typeof body.birthDate !== "string") || typeof body.adultEligible !== "boolean") {
    throw new AccountProfileRequestError("PROFILE_RESPONSE_INVALID");
  }
  return { birthDate: body.birthDate as string | null, adultEligible: body.adultEligible };
}

export function readAdultProfile(fetcher: typeof fetch = fetch) {
  return request("/api/account/profile", { cache: "no-store" }, fetcher).then(parseProfile);
}

export function saveAdultBirthDate(birthDate: string, fetcher: typeof fetch = fetch) {
  return request("/api/account/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ birthDate }),
  }, fetcher).then(parseProfile);
}
