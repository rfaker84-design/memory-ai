import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./pickup-photo-source-service.ts", import.meta.url), "utf8");

test("pickup photo selection is constrained to the current Owner and TA and never returns storage internals", () => {
  assert.match(source, /JOIN public\.memories memory ON memory\.id=asset\.memory_id/);
  assert.match(source, /account\.external_id=\$2/);
  assert.match(source, /asset\.memory_id=\$1::uuid/);
  assert.match(source, /asset\.media_type='image' AND asset\.status='uploaded' AND asset\.deleted_at IS NULL/);
  assert.doesNotMatch(source, /storage_key|thumbnail_key|sha256|metadata/);
});
