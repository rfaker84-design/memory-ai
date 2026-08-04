import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("mobile crisis support uses only the formal consent and contact APIs without claiming automatic outreach", () => {
  assert.match(api, /getCrisisSupport[\s\S]*?\/api\/consents[\s\S]*?\/api\/account\/crisis-contacts/);
  assert.match(api, /consentType: "crisis_support_escalation"/);
  assert.match(api, /async updateCrisisContact\(consentId: string, action: "accept" \| "revoke"\)/);
  assert.match(app, /对方需自行登录并明确接受，系统不会自动通知/);
  assert.match(app, /不会替你联系任何人/);
});
