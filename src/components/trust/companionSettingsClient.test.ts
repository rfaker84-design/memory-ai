import assert from "node:assert/strict";
import test from "node:test";

import { fetchCompanionSettings } from "./companionSettingsClient";

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
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
});
