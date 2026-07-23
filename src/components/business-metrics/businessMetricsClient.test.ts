import assert from "node:assert/strict";
import test from "node:test";

import { recordBusinessView } from "./businessMetricsClient";

test("business view events carry only the allowed event and opaque memory identifier", async () => {
  let input = "";
  let init: RequestInit | undefined;
  recordBusinessView("payment_entry_viewed", "memory-id", async (request, options) => {
    input = String(request);
    init = options;
    return new Response(null, { status: 204 });
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(input, "/api/business-events");
  assert.equal(init?.method, "POST");
  assert.deepEqual(JSON.parse(String(init?.body)), { event: "payment_entry_viewed", memoryId: "memory-id" });
  assert.equal(init?.keepalive, true);
});
