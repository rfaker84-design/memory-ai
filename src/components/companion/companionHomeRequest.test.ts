import assert from "node:assert/strict";
import test from "node:test";

import { CompanionHomeRequestError, fetchCompanionHomeMemories } from "./companionHomeRequest";

test("companion-home read uses the owner cookie boundary and a bounded abort", async () => {
  let init: RequestInit | undefined;
  const response = await fetchCompanionHomeMemories(async (_input, next) => {
    init = next;
    return new Response("[]", { status: 200 });
  });
  assert.equal(response.status, 200);
  assert.equal(init?.credentials, "same-origin");
  assert.equal(init?.cache, "no-store");
  assert.ok(init?.signal instanceof AbortSignal);
});

test("companion-home timeout does not retry a read automatically", async () => {
  await assert.rejects(
    () => fetchCompanionHomeMemories((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }), undefined, 1),
    (error: unknown) => error instanceof CompanionHomeRequestError && error.code === "COMPANION_HOME_TIMEOUT",
  );
});
