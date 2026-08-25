import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const companion = readFileSync(new URL("./companion/page.tsx", import.meta.url), "utf8");
const guest = readFileSync(new URL("../components/world/GuestExperience.tsx", import.meta.url), "utf8");

test("every cold root launch plays the brand opening and then enters the fixed companion home", () => {
  assert.match(home, /<StaticBrandLaunch onComplete=\{enterHome\} ready \/>/);
  assert.match(home, /router\.replace\("\/companion"\)/);
  assert.doesNotMatch(home, /fetchAuthRequestJson|fetchCompanionHomeMemoriesJson|resolvePostLoginDestination|localStorage|sessionStorage/);
});

test("the fixed home does not force a guest login or request private memories", () => {
  assert.match(companion, /fetchAuthRequestJson\("\/api\/auth\/session"/);
  const loadStart = companion.indexOf("const load =");
  const sessionGate = companion.slice(loadStart, companion.indexOf("fetchCompanionHomeMemoriesJson", loadStart));
  assert.match(sessionGate, /setState\("home"\)/);
  assert.match(companion, /if \(state === "home"\)[\s\S]*?<GuestExperience/);
  assert.doesNotMatch(companion, /router\.replace\("\/login"\)/);
  assert.doesNotMatch(companion, /router\.replace\("\/memory-world"\)/);
  assert.doesNotMatch(guest, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|\/api\//);
});

test("creation is the only homepage conversion and it asks for login only when needed", () => {
  assert.match(companion, /if \(authenticated\) \{[\s\S]*?router\.push\("\/create-memory"\)/);
  assert.match(companion, /setLoginIntent\("create"\)/);
  assert.match(companion, /loginIntent === "create"[\s\S]*?router\.replace\("\/create-memory"\)/);
  assert.match(companion, /<OriginalHomeLogin onAuthenticated=\{completeAuthentication\}/);
});

test("the fixed home does not restore a prior page, draft, or newest memory", () => {
  assert.match(companion, /allowSingleMemoryFallback: false/);
  assert.match(companion, /The fixed home never restores a former route or silently promotes/);
  assert.doesNotMatch(companion, /const selected = memories\[0\]|memories\.slice\(0,|router\.replace\(entryResolution\)/);
});
