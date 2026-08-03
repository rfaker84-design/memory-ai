export type TrustConsentType = "adult_eligibility" | "memory_profile" | "media_asset" | "commercial_use" | "crisis_support_escalation";

export class TrustConsentRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const TRUST_CONSENT_TIMEOUT_MS = 20_000;

type ConsentResponseReader<T> = (response: Response, signal: AbortSignal) => Promise<T>;

function idempotencyKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `consent-${random}`;
}

async function requestWithTimeout<T = Response>(
  input: RequestInfo | URL,
  init: RequestInit,
  request: typeof fetch,
  timeoutMs = TRUST_CONSENT_TIMEOUT_MS,
  readResponse?: ConsentResponseReader<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await request(input, { ...init, signal: controller.signal });
    return readResponse ? await readResponse(response, controller.signal) : response as T;
  } catch (error) {
    if (timedOut) throw new TrustConsentRequestError("CONSENT_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function readConsentJson(response: Response, signal: AbortSignal): Promise<{ response: Response; body: Record<string, unknown> }> {
  try {
    const parsed: unknown = await response.json();
    return {
      response,
      body: typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {},
    };
  } catch (error) {
    if (signal.aborted) throw error;
    return { response, body: {} };
  }
}

export async function recordTrustConsent(
  consentType: TrustConsentType,
  memoryId?: string,
  request: typeof fetch = fetch,
): Promise<void> {
  const { response, body } = await requestWithTimeout("/api/consents", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey(),
    },
    body: JSON.stringify(memoryId ? { consentType, memoryId } : { consentType }),
  }, request, TRUST_CONSENT_TIMEOUT_MS, readConsentJson);

  if (!response.ok) {
    throw new TrustConsentRequestError(typeof body.error === "string" ? body.error : "CONSENT_RECORD_FAILED");
  }
}

export async function revokeCrisisSupportConsent(request: typeof fetch = fetch): Promise<void> {
  const response = await requestWithTimeout("/api/consents", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consentType: "crisis_support_escalation" }) }, request);
  if (!response.ok) throw new TrustConsentRequestError("CONSENT_REVOKE_FAILED");
}
