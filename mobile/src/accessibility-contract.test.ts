import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

test("mobile reduced-motion preference disables both entrance and interaction movement", () => {
  assert.match(styles, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*?animation: soft-enter/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration: \.01ms !important/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition-duration: \.01ms !important/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?button:active \{ transform: none; \}/);
  assert.match(styles, /button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible/);
});
