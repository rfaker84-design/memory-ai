import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("global accessibility keeps browser zoom, focus visibility, and a keyboard skip link", () => {
  assert.doesNotMatch(readFileSync("app/layout.tsx", "utf8"), /maximumScale/);
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.skip-link/);
  assert.match(css, /html\s*\{[\s\S]*?font-size:100%;[\s\S]*?-webkit-text-size-adjust:100%;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration:0\.01ms !important;[\s\S]*?transition-duration:0\.01ms !important;[\s\S]*?scroll-behavior:auto !important;/);
  const shell = readFileSync("src/components/MobileAppShell.tsx", "utf8");
  assert.match(shell, /href="#main-content"/);
  assert.match(shell, /id="main-content"/);
  assert.match(shell, /aria-label="主导航"/);
  assert.match(shell, /aria-current=\{a \? "page" : undefined\}/);
  assert.match(shell, /<motion\.button key=\{t\.key\} type="button"/);
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

test("first encounter respects the shared static fallback before it can autoplay a meeting video", () => {
  const encounter = readFileSync("app/memory/[id]/encounter/page.tsx", "utf8");
  assert.match(encounter, /useQuietCompanionPresence\(\{ reducedMotion, replying: false \}\)/);
  assert.match(encounter, /const useStaticEncounter = presence === "static"/);
  assert.match(encounter, /state\.playbackUrl && !useStaticEncounter \? <div/);
  assert.match(encounter, /<video src=\{state\.playbackUrl\} autoPlay playsInline/);
  assert.match(encounter, /首次相遇影像不会自动播放/);
});
