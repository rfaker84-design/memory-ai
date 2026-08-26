import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => readFileSync(file, "utf8");

test("the direct login URL returns an authenticated user to the root home", () => {
  const loginPage = read("app/login/page.tsx");
  const flow = read("src/components/first-presence/FirstPresenceFlow.tsx");

  assert.match(loginPage, /FirstPresenceFlow initialStage="login-phone"/);
  assert.match(flow, /fetchAuthRequestJson\("\/api\/auth\/send-code"/);
  assert.match(flow, /fetchAuthRequestJson\("\/api\/auth\/verify-code"/);
  assert.match(flow, /const authenticated = sessionResponse\.ok && Boolean\(sessionPayload\.authenticated\)/);
  assert.match(flow, /if \(directLogin\) \{[\s\S]*?if \(onAuthenticated\) await onAuthenticated\(\);[\s\S]*?router\.replace\("\/"\)/);
  assert.doesNotMatch(flow, /resolvePostLoginDestination/);
  assert.doesNotMatch(flow, /if \(directLogin\) setStage\("questions"\)/);
});

test("the true public home distinguishes login from an explicitly requested creation", () => {
  const home = read("app/page.tsx");
  const companion = read("app/companion/page.tsx");

  assert.match(home, /type LoginIntent = "login" \| "create"/);
  assert.match(home, /onAuthenticated=\{completeAuthentication\}/);
  assert.match(home, /loginIntent === "create"[\s\S]*?router\.replace\("\/create-memory"\)/);
  assert.match(home, /<OriginalHomeLogin[\s\S]*?onAuthenticated=\{completeAuthentication\}/);
  assert.doesNotMatch(home, /FirstPresenceFlow initialStage="create"|FirstPresenceFlow initialStage="preview-create"/);
  assert.doesNotMatch(companion, /type LoginIntent|OriginalHomeLogin|GuestExperience/);
});
