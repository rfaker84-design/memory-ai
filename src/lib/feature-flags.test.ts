import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCTION_PAGES } from "./feature-flags";

test("internal artwork preview is never listed as a production page", () => {
  assert.equal(PRODUCTION_PAGES.includes("/app-store-preview" as never), false);
});
