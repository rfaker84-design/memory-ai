import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const world = readFileSync(new URL("./memory-world/page.tsx", import.meta.url), "utf8");

test("the root always resolves to the home after the existing launch", () => {
  assert.match(home, /type EntryStage = "checking" \| "launch" \| "home" \| "login" \| "preview"/);
  assert.match(home, /useState<EntryStage>\("launch"\)/);
  assert.match(home, /const showLaunch = claimBrandLaunch\(window\.sessionStorage\)/);
  assert.match(home, /if \(!launchComplete \|\| homeState === null\) return;[\s\S]*?setStage\("home"\)/);
  assert.match(home, /<StaticBrandLaunch onComplete=\{completeLaunch\} ready=\{homeState !== null\} \/>/);
  assert.match(home, /stage === "home" && homeState/);
  assert.doesNotMatch(home, /resolvePostLoginDestination|router\.replace\(entryResolution\)/);
  const startup = home.slice(home.indexOf("useEffect(() => {"), home.indexOf("const completeLaunch"));
  assert.doesNotMatch(startup, /router\.(?:push|replace)\(/);
});

test("the root reads only the current Owner list and resolves real portraits", () => {
  assert.match(home, /fetchAuthRequestJson\("\/api\/auth\/session"/);
  assert.match(home, /response\.ok \|\| payload\.authenticated !== true/);
  assert.match(home, /fetchCompanionHomeMemoriesJson\(fetch, signal\)/);
  assert.match(home, /loadOwnedMediaUrl\(assetId, signal\)/);
  assert.match(home, /credentials: "same-origin"/);
  assert.match(home, /cache: "no-store"/);
  assert.match(home, /memoriesBody\.slice\(0, 3\)/);
});

test("formal creation and person selection use the existing product routes", () => {
  assert.match(home, /if \(homeState\?\.authenticated\) \{[\s\S]*?router\.push\("\/create-memory"\)/);
  assert.match(home, /setLoginIntent\("create"\)[\s\S]*?setStage\("login"\)/);
  assert.match(home, /if \(loginIntent === "create"\) \{[\s\S]*?router\.replace\("\/create-memory"\)/);
  assert.match(home, /window\.localStorage\.setItem\(COMPANION_PRIMARY_KEY, personId\)/);
  assert.match(home, /router\.push\("\/companion"\)/);
  assert.doesNotMatch(home, /FirstPresenceFlow initialStage="create"/);
  assert.match(home, /FirstPresenceFlow initialStage="preview-create"/);
});

test("a stale Owner view is cleared before memory-world exposes the public experience link", () => {
  const unauthenticated = world.slice(world.indexOf("if (response.status === 401)"), world.indexOf("if (!response.ok)"));
  for (const reset of [
    "setMemories([])",
    "setPrimaryId(null)",
    "setPrimaryPortraitUrl(null)",
    "setDailyGreetingVisible(false)",
  ]) assert.ok(unauthenticated.includes(reset));
  assert.match(world, /先看看忆见的公开体验/);
  assert.match(world, /href="\/"/);
});
