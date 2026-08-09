import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const world = readFileSync(new URL("./memory-world/page.tsx", import.meta.url), "utf8");

test("the root sends a guest to the public experience instead of forcing the login surface", () => {
  assert.match(home, /type EntryStage = "checking" \| "launch" \| "guest" \| "login" \| "preview"/);
  assert.match(home, /setStage\(claimBrandLaunch\(window\.sessionStorage\) \? "launch" : "guest"\)/);
  assert.match(home, /stage === "guest" && <GuestExperience/);
  assert.match(home, /onLogin=\{\(\) => setStage\("login"\)\}/);
  assert.doesNotMatch(home, /router\.(?:push|replace)\("\/login"\)/);
});
test("an authenticated Owner still routes only from the formal Owner-scoped memory list", () => {
  assert.match(home, /fetchAuthRequestJson\("\/api\/auth\/session"/);
  assert.match(home, /response\.ok && payload\.authenticated === true/);
  assert.match(home, /await resolvePostLoginDestination\(fetch, controller\.signal\)/);
  assert.match(home, /router\.replace\(destination\)/);
  assert.match(home, /credentials: "same-origin"/);
  assert.match(home, /cache: "no-store"/);
});

test("the guest conversion opens login on demand and then uses the formal post-login destination", () => {
  assert.match(home, /<GuestExperience onLogin=\{\(\) => setStage\("login"\)\}/);
  assert.match(home, /<OriginalHomeLogin onAuthenticated=\{enterOwnerProduct\}/);
  assert.match(home, /const enterOwnerProduct = useCallback\(async \(\) => \{[\s\S]*?resolvePostLoginDestination\(\)[\s\S]*?router\.replace\(destination\)/);
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
