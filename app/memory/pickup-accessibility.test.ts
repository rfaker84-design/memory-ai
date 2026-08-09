import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const index = readFileSync(new URL("../(memory)/memory/page.tsx", import.meta.url), "utf8");
const pickup = readFileSync(new URL("./[id]/pickup/page.tsx", import.meta.url), "utf8");
const sources = readFileSync(new URL("./[id]/sources/page.tsx", import.meta.url), "utf8");

test("pickup surfaces announce loading and errors and preserve minimum touch targets", () => {
  assert.match(index, /state === "loading" && <p className=\{styles\.status\} role="status" aria-live="polite">/);
  assert.match(index, /page\.module\.css/);
  assert.match(pickup, /role=\{state === "error" \? "alert" : "status"\}/);
  assert.match(pickup, /aria-live=\{state === "error" \? undefined : "polite"\}/);
  assert.match(pickup, /function TouchButton[\s\S]*?minHeight: 44/);
  assert.match(pickup, /role="dialog" aria-modal="true"/);
  assert.match(pickup, /className=\{styles\.editDialog\}/);
  assert.match(pickup, /!editing && <form/);
  assert.match(sources, /role=\{state\.status === "error" \? "alert" : "status"\}/);
  assert.match(sources, /aria-live=\{state\.status === "error" \? undefined : "polite"\}/);
  assert.match(sources, /style=\{\{ minHeight: 44 \}\}/);
});

test("collection styling preserves safe areas, readable touch targets, and reduced motion", () => {
  const indexStyles = readFileSync(new URL("../(memory)/memory/page.module.css", import.meta.url), "utf8");
  const pickupStyles = readFileSync(new URL("./[id]/pickup/page.module.css", import.meta.url), "utf8");
  for (const styles of [indexStyles, pickupStyles]) {
    assert.match(styles, /safe-area-inset-top/);
    assert.match(styles, /safe-area-inset-bottom/);
    assert.match(styles, /min-height: 44px/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(styles, /focus-visible/);
  }
});
