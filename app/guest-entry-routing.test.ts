import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
const launchGate = readFileSync(new URL("../src/components/launch/PublicBrandLaunchGate.tsx", import.meta.url), "utf8");
const launchPolicy = readFileSync(new URL("../src/components/launch/publicBrandLaunchPolicy.ts", import.meta.url), "utf8");
const companion = readFileSync(new URL("./companion/page.tsx", import.meta.url), "utf8");
const guest = readFileSync(new URL("../components/world/GuestExperience.tsx", import.meta.url), "utf8");

test("every cold public launch renders the approved opening once above all public routes", () => {
  assert.match(layout, /<PublicBrandLaunchGate>[\s\S]*?<MobileAppShell>/);
  assert.match(launchPolicy, /pathname === "\/" \|\| pathname === "\/guest" \|\| pathname\.startsWith\("\/guest\/"\)/);
  assert.match(launchGate, /claimBrandLaunch\(window\.sessionStorage\)/);
  assert.match(launchGate, /useLayoutEffect/);
  assert.match(launchGate, /<StaticBrandLaunch ready onComplete=\{\(\) => setShowLaunch\(false\)\} \/>/);
  assert.match(home, /type HomeStage = "home" \| "login"/);
  assert.match(home, /useState<HomeStage>\("home"\)/);
  assert.match(home, /stage === "home" && <GuestExperience onLogin=\{openLogin\} onStart=\{beginCreation\} \/>/);
  assert.doesNotMatch(home, /router\.(?:push|replace)\("\/companion"\)/);
  assert.doesNotMatch(home, /fetchCompanionHomeMemoriesJson|resolvePostLoginDestination|localStorage|sessionStorage/);

  assert.doesNotMatch(home, /StaticBrandLaunch|stage === "launch"/);
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
  assert.match(companion, /resolveCompanionPrimaryPreference\(memories, ownerId, window\.localStorage\)/);
  assert.match(companion, /if \(!selected\) \{[\s\S]*?setState\("redirecting"\)/);
  assert.match(companion, /if \(state === "redirecting"\) router\.replace\("\/"\)/);
  assert.match(companion, /正在返回首页/);
  assert.doesNotMatch(companion, /<GuestExperience|<OriginalHomeLogin|setState\("home"\)/);
  assert.doesNotMatch(companion, /router\.replace\("\/login"\)/);
  assert.doesNotMatch(companion, /router\.replace\("\/memory-world"\)/);
});
