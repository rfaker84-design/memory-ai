import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const index = readFileSync(new URL("../(memory)/memory/page.tsx", import.meta.url), "utf8");
const pickup = readFileSync(new URL("./[id]/pickup/page.tsx", import.meta.url), "utf8");
const sources = readFileSync(new URL("./[id]/sources/page.tsx", import.meta.url), "utf8");

test("pickup surfaces announce loading and errors and preserve minimum touch targets", () => {
  assert.match(index, /state === "loading" && <p role="status" aria-live="polite">/);
  assert.match(index, /style=\{\{ minHeight: 44 \}\}/);
  assert.match(pickup, /role=\{state === "error" \? "alert" : "status"\}/);
  assert.match(pickup, /aria-live=\{state === "error" \? undefined : "polite"\}/);
  assert.match(pickup, /function TouchButton[\s\S]*?minHeight: 44/);
  assert.match(sources, /role=\{state\.status === "error" \? "alert" : "status"\}/);
  assert.match(sources, /aria-live=\{state\.status === "error" \? undefined : "polite"\}/);
  assert.match(sources, /style=\{\{ minHeight: 44 \}\}/);
});
