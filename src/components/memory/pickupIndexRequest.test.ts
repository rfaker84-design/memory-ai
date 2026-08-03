import assert from "node:assert/strict";
import test from "node:test";

import { fetchPickupIndexMemories, PickupIndexRequestError } from "./pickupIndexRequest";

test("pickup entry read uses the owner-scoped memories endpoint and preserves request boundaries", async () => {
  let input = "";
  let init: RequestInit | undefined;
  const response = new Response("[]", { status: 200 });
  const result = await fetchPickupIndexMemories(async (nextInput, nextInit) => {
    input = String(nextInput);
    init = nextInit;
    return response;
  });
  assert.equal(result.response, response);
  assert.deepEqual(result.body, []);
  assert.equal(input, "/api/memories");
  assert.equal(init?.credentials, "same-origin");
  assert.equal(init?.cache, "no-store");
});

test("pickup entry times out instead of leaving an unbounded read or auto-retrying", async () => {
  await assert.rejects(
    () => fetchPickupIndexMemories((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }), undefined, 1),
    (error: unknown) => error instanceof PickupIndexRequestError && error.code === "PICKUP_INDEX_TIMEOUT",
  );
});
