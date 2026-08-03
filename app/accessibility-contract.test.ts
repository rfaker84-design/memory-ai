import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("global accessibility keeps browser zoom, focus visibility, and a keyboard skip link", () => {
  assert.doesNotMatch(readFileSync("app/layout.tsx", "utf8"), /maximumScale/);
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.skip-link/);
  const shell = readFileSync("src/components/MobileAppShell.tsx", "utf8");
  assert.match(shell, /href="#main-content"/);
  assert.match(shell, /id="main-content"/);
  assert.match(shell, /aria-label="主导航"/);
  assert.match(shell, /aria-current=\{a \? "page" : undefined\}/);
  assert.doesNotMatch(shell, /outline:"none"/);
});

test("bottom navigation is limited to first-release root destinations", () => {
  const shell = readFileSync("src/components/MobileAppShell.tsx", "utf8");
  assert.match(shell, /pathname === "\/memory" \|\| pathname === "\/continuity"/);
  assert.match(shell, /if \(!showsRootNavigation\) \{[\s\S]*?return <>\{children\}<\/>;/);
  assert.match(shell, /Creation,[\s\S]*companion chat,[\s\S]*memory-detail/);
  const companion = readFileSync("app/memory-world/page.tsx", "utf8");
  assert.match(companion, /<nav aria-label="主导航"/);
  assert.match(companion, /aria-current=\{item\.href === "\/memory-world" \? "page" : undefined\}/);
});

test("the retired four-tab navigation cannot be wired back into the first release", () => {
  assert.equal(existsSync("src/components/BottomNav.tsx"), false);
  assert.equal(existsSync("src/components/BottomNavWrapper.tsx"), false);
});
