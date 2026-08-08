import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => readFileSync(file, "utf8");

test("the direct login URL confirms the server session before entering the owner memory world", () => {
  const loginPage = read("app/login/page.tsx");
  const flow = read("src/components/first-presence/FirstPresenceFlow.tsx");

  assert.match(loginPage, /FirstPresenceFlow initialStage="login-phone"/);
  assert.doesNotMatch(loginPage, /router\.push\("\/"\)/);
  assert.match(flow, /fetchAuthRequestJson\("\/api\/auth\/send-code"/);
  assert.match(flow, /fetchAuthRequestJson\("\/api\/auth\/verify-code"/);
  assert.match(flow, /const authenticated = sessionResponse\.ok && Boolean\(sessionPayload\.authenticated\)/);
  assert.match(flow, /if \(!authenticated\)/);
  assert.match(flow, /if \(directLogin\) \{[\s\S]*?resolvePostLoginDestination\(/);
  assert.match(flow, /router\.replace\(destination\)/);
  assert.doesNotMatch(flow, /if \(directLogin\) setStage\("questions"\)/);
  assert.doesNotMatch(flow, /(?:demo|test)[ -]?(?:code|验证码)/i);
});

test("the public home login no longer mounts the retired eight-question creator", () => {
  const home = read("app/page.tsx");

  assert.match(home, /onAuthenticated=\{enterOwnerProduct\}/);
  assert.match(home, /const destination = await resolvePostLoginDestination\(\)/);
  assert.doesNotMatch(home, /FirstPresenceFlow initialStage="create"/);
  assert.match(home, /FirstPresenceFlow initialStage="preview-create"/);
});
