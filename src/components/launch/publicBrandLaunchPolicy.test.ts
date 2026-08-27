import assert from "node:assert/strict";
import test from "node:test";

import { isPublicProductRoute } from "./publicBrandLaunchPolicy";

test("the approved opening applies to cold public entry routes but never a private person space", () => {
  for (const pathname of ["/", "/guest", "/guest/companion", "/guest/memories", "/guest/create", "/guest/account"]) {
    assert.equal(isPublicProductRoute(pathname), true, pathname);
  }

  for (const pathname of ["/companion", "/memory-world", "/login", "/memory-chat/example"]) {
    assert.equal(isPublicProductRoute(pathname), false, pathname);
  }
});
