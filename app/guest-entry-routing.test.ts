import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const companion = readFileSync(new URL("./companion/page.tsx", import.meta.url), "utf8");
const guest = readFileSync(new URL("../components/world/GuestExperience.tsx", import.meta.url), "utf8");

test("every cold root launch renders the approved opening immediately and then mounts the public carousel in place", () => {
  assert.match(home, /type HomeStage = "launch" \| "home" \| "login"/);
  assert.match(home, /useState<HomeStage>\(complete \? "home" : "launch"\)/);
  assert.match(home, /<StaticBrandLaunch onComplete=\{enterHome\} ready \/>/);
  assert.match(home, /const enterHome = useCallback\(\(\) => \{ finish\(\); setStage\("home"\); \}, \[finish\]\)/);
  assert.match(home, /stage === "home" && <GuestExperience onLogin=\{openLogin\} onStart=\{beginCreation\} \/>/);
  assert.doesNotMatch(home, /router\.(?:push|replace)\("\/companion"\)/);
  assert.doesNotMatch(home, /fetchCompanionHomeMemoriesJson|resolvePostLoginDestination|localStorage|sessionStorage/);

  const coldStartup = home.slice(home.indexOf("export default function HomePage"), home.indexOf("const beginCreation"));
  assert.doesNotMatch(coldStartup, /fetchAuthRequestJson|router\.(?:push|replace)\(/);
});

test("the public carousel does not force a guest login or request private memories", () => {
  assert.match(home, /<GuestExperience onLogin=\{openLogin\} onStart=\{beginCreation\} \/>/);
  assert.match(home, /const openLogin = useCallback\(\(\) => \{[\s\S]*?setStage\("login"\)/);
  assert.match(home, /<OriginalHomeLogin[\s\S]*?onAuthenticated=\{completeAuthentication\}/);
  assert.doesNotMatch(home, /router\.replace\("\/login"\)/);
  assert.doesNotMatch(guest, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|\/api\//);
});

test("creation enters a public local first step without a session read or an immediate login wall", () => {
  assert.match(home, /const beginCreation = useCallback\(\(\) => \{[\s\S]*?router\.push\("\/guest\/create"\)/);
  assert.doesNotMatch(home, /fetchAuthRequestJson|\/api\/auth\/session|setLoginIntent/);
});

test("companion is a second-level route and never turns an absent context into the public carousel or a default person", () => {
  assert.match(companion, /fetchAuthRequestJson\("\/api\/auth\/session"/);
  const loadStart = companion.indexOf("const load =");
  const sessionGate = companion.slice(loadStart, companion.indexOf("fetchCompanionHomeMemoriesJson", loadStart));
  assert.match(sessionGate, /setMemory\(null\)[\s\S]*?setState\("redirecting"\)/);
  assert.match(companion, /resolveCompanionPrimaryPreference\(memories, ownerId, window\.localStorage, \{ allowSingleMemoryFallback: false \}\)/);
  assert.match(companion, /if \(!selected\) \{[\s\S]*?setState\("redirecting"\)/);
  assert.match(companion, /if \(state === "redirecting"\) router\.replace\("\/"\)/);
  assert.match(companion, /正在返回首页/);
  assert.doesNotMatch(companion, /<GuestExperience|<OriginalHomeLogin|setState\("home"\)/);
  assert.doesNotMatch(companion, /router\.replace\("\/login"\)/);
  assert.doesNotMatch(companion, /router\.replace\("\/memory-world"\)/);
});
