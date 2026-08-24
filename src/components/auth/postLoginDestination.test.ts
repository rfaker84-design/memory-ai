import assert from "node:assert/strict";
import test from "node:test";

import {
  PostLoginDestinationError,
  resolvePostLoginDestination,
} from "./postLoginDestination";

test("post-login always lands in the Owner space so creation is an explicit choice", async () => {
  const calls: RequestInit[] = [];
  const returning = await resolvePostLoginDestination((async (_input, init) => {
    calls.push(init ?? {});
    return Response.json([{ id: "owned-memory" }]);
  }) as typeof fetch);
  const firstTime = await resolvePostLoginDestination((async () => Response.json([])) as typeof fetch);

  assert.equal(returning, "/memory-world");
  assert.equal(firstTime, "/memory-world");
  assert.equal(calls[0]?.credentials, "same-origin");
  assert.equal(calls[0]?.cache, "no-store");
});

test("post-login routing never uses local state to bypass a missing or failed Owner read", async () => {
  await assert.rejects(
    resolvePostLoginDestination((async () => Response.json(
      { error: "UNAUTHENTICATED" },
      { status: 401 },
    )) as typeof fetch),
    (error) => error instanceof PostLoginDestinationError
      && error.code === "POST_LOGIN_SESSION_LOST",
  );
  await assert.rejects(
    resolvePostLoginDestination((async () => Response.json(
      { error: "DATABASE_UNAVAILABLE" },
      { status: 503 },
    )) as typeof fetch),
    (error) => error instanceof PostLoginDestinationError
      && error.code === "POST_LOGIN_OWNER_READ_FAILED",
  );
  await assert.rejects(
    resolvePostLoginDestination((async () => Response.json({ memories: [] })) as typeof fetch),
    (error) => error instanceof PostLoginDestinationError
      && error.code === "POST_LOGIN_OWNER_READ_FAILED",
  );
});
