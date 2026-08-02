import assert from "node:assert/strict";
import test from "node:test";

import { fetchPickupRequest, PickupRequestError } from "./pickupRequestClient";

test("pickup requests keep owner-session boundaries and supplied mutation details", async () => {
  let captured: RequestInit | undefined;
  const response = new Response(null, { status: 204 });
  assert.equal(await fetchPickupRequest("/api/memories/memory-1/pickups", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "pickup-1" },
    body: "{}",
  }, undefined, async (_input, init) => {
    captured = init;
    return response;
  }), response);
  assert.equal(captured?.method, "POST");
  assert.equal(captured?.credentials, "same-origin");
  assert.equal(captured?.cache, "no-store");
  assert.equal(new Headers(captured?.headers).get("idempotency-key"), "pickup-1");
  assert.ok(captured?.signal instanceof AbortSignal);
});

test("pickup requests time out without autonomous replay", async () => {
  await assert.rejects(
    fetchPickupRequest("/api/memories/memory-1/pickups", {}, undefined, (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }), 1),
    (error: unknown) => error instanceof PickupRequestError && error.code === "PICKUP_REQUEST_TIMEOUT",
  );
});
