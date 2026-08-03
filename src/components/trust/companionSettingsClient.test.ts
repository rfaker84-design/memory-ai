import assert from "node:assert/strict";
import test from "node:test";

import { fetchCompanionSettings, fetchCompanionSettingsJson } from "./companionSettingsClient";

test("companion settings read is same-origin, uncached, and timeout-bound", async () => {
  let captured: RequestInit | undefined;
  const request = async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = init;
    return new Response(JSON.stringify({ crisisSupportEnabled: false }), { status: 200 });
  };

  await fetchCompanionSettings(undefined, request as typeof fetch);
  assert.equal(captured?.credentials, "same-origin");
  assert.equal(captured?.cache, "no-store");
  assert.ok(captured?.signal instanceof AbortSignal);
});

test("companion settings read aborts when its bounded wait expires", async () => {
  const request = (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });

  await assert.rejects(
    fetchCompanionSettings(undefined, request as typeof fetch, 0),
    (error: unknown) => error instanceof Error && error.message === "COMPANION_SETTINGS_TIMEOUT",
  );
});

test("companion settings read retains its timeout through a stalled JSON body", async () => {
  await assert.rejects(
    fetchCompanionSettingsJson(undefined, async (_input, init) => ({
      ok: true, status: 200, headers: new Headers(),
      json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })),
    }) as Response, 1),
    (error: unknown) => error instanceof Error && error.message === "COMPANION_SETTINGS_TIMEOUT",
  );
});
