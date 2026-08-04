import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

test("mobile shell preserves system text sizing and a visible keyboard focus indicator", () => {
  assert.match(styles, /-webkit-text-size-adjust:\s*100%/);
  assert.match(styles, /text-size-adjust:\s*100%/);
  assert.match(styles, /button:focus-visible, input:focus-visible, textarea:focus-visible\s*\{\s*outline:\s*3px/);
});

test("mobile interactive controls keep the 44px touch boundary", () => {
  assert.match(styles, /\.textButton, \.quietLink, \.backButton, \.headerAction\s*\{\s*min-width:\s*44px;\s*min-height:\s*44px/);
  assert.match(styles, /\.backButton\s*\{\s*width:\s*44px;\s*height:\s*44px/);
  assert.match(styles, /\.chatComposer button\s*\{\s*min-height:\s*44px/);
});
