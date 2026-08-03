import assert from "node:assert/strict";
import test from "node:test";

import { AuthRequestError, fetchAuthRequest } from "./authRequestClient";

test("auth request preserves caller payload and same-origin boundary", async () => {
  let captured: RequestInit | undefined;
  const response = new Response(null, { status: 204 });
  assert.equal(await fetchAuthRequest("/api/auth/verify-code", {
    method: "POST", credentials: "same-origin", body: "{}",
  }, async (_input, init) => {
    captured = init;
    return response;
  }), response);
  assert.equal(captured?.method, "POST");
  assert.equal(captured?.credentials, "same-origin");
  assert.equal(captured?.body, "{}");
  assert.ok(captured?.signal instanceof AbortSignal);
});

test("auth request times out without an automatic retry", async () => {
  await assert.rejects(
    fetchAuthRequest("/api/auth/session", {}, (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }), undefined, 1),
    (error: unknown) => error instanceof AuthRequestError && error.code === "AUTH_REQUEST_TIMEOUT",
  );
});
