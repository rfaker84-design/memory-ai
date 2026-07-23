import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => readFileSync(file, "utf8");

test("the direct login URL enters the existing server-verified SMS and creation flow", () => {
  const loginPage = read("app/login/page.tsx");
  const flow = read("src/components/first-presence/FirstPresenceFlow.tsx");

  assert.match(loginPage, /FirstPresenceFlow initialStage="login-phone"/);
  assert.doesNotMatch(loginPage, /router\.push\("\/"\)/);
  assert.match(flow, /fetch\("\/api\/auth\/send-code"/);
  assert.match(flow, /fetch\("\/api\/auth\/verify-code"/);
  assert.match(flow, /const authenticated = await refreshSession\(\)/);
  assert.match(flow, /if \(!authenticated\)/);
  assert.match(flow, /setStage\("create"\)/);
  assert.doesNotMatch(flow, /(?:demo|test)[ -]?(?:code|验证码)/i);
});
