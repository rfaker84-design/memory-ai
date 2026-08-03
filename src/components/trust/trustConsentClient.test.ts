import assert from "node:assert/strict";
import test from "node:test";

import { recordTrustConsent, revokeCrisisSupportConsent } from "./trustConsentClient";

test("consent writes are authenticated, idempotent, and timeout-bound", async () => {
  let captured: RequestInit | undefined;
  const request = async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = init;
    return new Response(null, { status: 204 });
  };

  await recordTrustConsent("crisis_support_escalation", "memory-1", request as typeof fetch);
  assert.equal(captured?.method, "POST");
  assert.equal(captured?.credentials, "same-origin");
  assert.ok(new Headers(captured?.headers).get("Idempotency-Key"));
  assert.ok(captured?.signal instanceof AbortSignal);
});

test("consent writes do not remain pending after their bounded wait", async () => {
  const request = (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: (...args: never[]) => void) => originalSetTimeout(callback, 0)) as unknown as typeof setTimeout;
  try {
    await assert.rejects(
      recordTrustConsent("memory_profile", undefined, request as typeof fetch),
      (error: unknown) => error instanceof Error && error.message === "CONSENT_REQUEST_TIMEOUT",
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("consent writes keep their timeout through a stalled error response body", async () => {
  const request = async (_input: RequestInfo | URL, init?: RequestInit) => ({
    ok: false,
    status: 503,
    json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })),
  }) as unknown as Response;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: (...args: never[]) => void) => originalSetTimeout(callback, 0)) as unknown as typeof setTimeout;
  try {
    await assert.rejects(
      recordTrustConsent("memory_profile", undefined, request as unknown as typeof fetch),
      (error: unknown) => error instanceof Error && error.message === "CONSENT_REQUEST_TIMEOUT",
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("crisis-support revocation uses the same bounded request contract", async () => {
  let captured: RequestInit | undefined;
  const request = async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = init;
    return new Response(null, { status: 204 });
  };

  await revokeCrisisSupportConsent(request as typeof fetch);
  assert.equal(captured?.method, "DELETE");
  assert.equal(captured?.credentials, "same-origin");
  assert.ok(captured?.signal instanceof AbortSignal);
});
