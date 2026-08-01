import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("global accessibility keeps browser zoom, focus visibility, and a keyboard skip link", () => {
  assert.doesNotMatch(readFileSync("app/layout.tsx", "utf8"), /maximumScale/);
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.skip-link/);
  const shell = readFileSync("src/components/MobileAppShell.tsx", "utf8");
  assert.match(shell, /href="#main-content"/);
  assert.match(shell, /id="main-content"/);
});
