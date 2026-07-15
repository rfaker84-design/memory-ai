import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { GET } from "./route";

test("collective analysis is a route-level legacy 410", async () => {
  const response = GET();
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), { error: "LEGACY_ROUTE_UNAVAILABLE" });
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("collective analysis imports no database or AI client", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /supabase|postgres|openai|provider|createClient/i);
});
