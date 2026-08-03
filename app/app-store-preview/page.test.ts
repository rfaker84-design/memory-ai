import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("app-store artwork remains internal and cannot expose legacy copy in production", () => {
  assert.match(page, /import \{ notFound \} from "next\/navigation"/);
  assert.match(page, /process\.env\.NODE_ENV === "production"/);
  assert.match(page, /process\.env\.APP_STORE_PREVIEW_MODE !== "true"/);
  assert.match(page, /notFound\(\)/);
});
