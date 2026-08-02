export type TrustConsentType = "adult_eligibility" | "memory_profile" | "media_asset" | "commercial_use" | "crisis_support_escalation";

export class TrustConsentRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const TRUST_CONSENT_TIMEOUT_MS = 20_000;

function idempotencyKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `consent-${random}`;
}

async function requestWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  request: typeof fetch,
  timeoutMs = TRUST_CONSENT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await request(input, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function recordTrustConsent(
  consentType: TrustConsentType,
  memoryId?: string,
  request: typeof fetch = fetch,
): Promise<void> {
  const response = await requestWithTimeout("/api/consents", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey(),
    },
    body: JSON.stringify(memoryId ? { consentType, memoryId } : { consentType }),
  }, request);

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: unknown };
    throw new TrustConsentRequestError(typeof body.error === "string" ? body.error : "CONSENT_RECORD_FAILED");
  }
}

export async function revokeCrisisSupportConsent(request: typeof fetch = fetch): Promise<void> {
  const response = await requestWithTimeout("/api/consents", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consentType: "crisis_support_escalation" }) }, request);
  if (!response.ok) throw new TrustConsentRequestError("CONSENT_REVOKE_FAILED");
}
