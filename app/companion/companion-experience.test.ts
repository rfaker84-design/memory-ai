import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../src/components/MobileAppShell.tsx", import.meta.url), "utf8");

test("companion remains an explicit person space and redirects missing context to the true public home", () => {
  assert.match(page, /type CompanionState = "loading" \| "redirecting" \| "ready" \| "error" \| "timeout"/);
  assert.match(page, /resolveCompanionPrimaryPreference\(memories, ownerId, window\.localStorage, \{ allowSingleMemoryFallback: false \}\)/);
  assert.match(page, /if \(!selected\) \{[\s\S]*?setState\("redirecting"\)/);
  assert.match(page, /if \(state === "redirecting"\) router\.replace\("\/"\)/);
  assert.match(page, /if \(state === "loading" \|\| state === "redirecting"\)/);
  assert.match(page, /if \(state === "error" \|\| state === "timeout" \|\| !memory\)/);
  assert.match(page, /portraitUrl[\s\S]*?<CompanionMotionBackground/);
  assert.match(page, /variant="idle"/);
  assert.match(page, /motionEnabled=\{!reducedMotion\}/);
  assert.doesNotMatch(page, /GuestExperience|OriginalHomeLogin|router\.replace\("\/memory-world"\)|router\.replace\("\/login"\)/);
});

test("the real Owner route keeps existing secondary chat, memory and video paths", () => {
  assert.match(page, /const chatRoute = `\/memory-chat\/\$\{encodeURIComponent\(memory\.id\)\}`/);
  assert.match(page, /const pickupRoute = `\/memory\/\$\{encodeURIComponent\(memory\.id\)\}\/pickup`/);
  assert.match(page, /router\.push\(companionVideoEntry\(memory\.id\)\)/);
  assert.match(page, /fetchPickupRequestJson\(`\/api\/memories\/\$\{encodeURIComponent\(selected\.id\)\}\/pickups`/);
  assert.match(styles, /@media \(max-width: 374px\)/);
  assert.match(shell, /path:"\/companion"/);
});

test("a guest companion request stops at session state before any private memory list", () => {
  const loadStart = page.indexOf("const load =");
  const publicGate = page.slice(loadStart, page.indexOf("fetchCompanionHomeMemoriesJson", loadStart));
  assert.match(publicGate, /setMemory\(null\)[\s\S]*?setState\("redirecting"\)/);
  assert.doesNotMatch(publicGate, /fetchCompanionHomeMemoriesJson/);
});
