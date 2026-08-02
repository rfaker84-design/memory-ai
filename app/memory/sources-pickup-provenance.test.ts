import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./[id]/sources/page.tsx", import.meta.url), "utf8");

test("reply provenance view includes the explicit pickup source set and its management route", () => {
  assert.match(source, /\/api\/memories\/\$\{encodeURIComponent\(id\)\}\/pickups/);
  assert.match(source, /拾忆中已确认的资料/);
  assert.match(source, /原话/);
  assert.match(source, /整理稿/);
  assert.match(source, /\/memory\/\$\{id\}\/pickup/);
});
