import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const wrapper = readFileSync(new URL("./OriginalHomeLogin.tsx", import.meta.url), "utf8");
const surface = readFileSync(new URL("../../src/components/first-presence/DirectLoginExperience.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../src/components/first-presence/DirectLoginExperience.module.css", import.meta.url), "utf8");
const flow = readFileSync(new URL("../../src/components/first-presence/FirstPresenceFlow.tsx", import.meta.url), "utf8");

test("the home and direct URL share one formal login experience", () => {
  assert.match(wrapper, /FirstPresenceFlow/);
  assert.match(wrapper, /initialStage="login-phone"/);
  assert.match(wrapper, /onLeaveHome=\{onBackToExperience\}/);
  assert.doesNotMatch(wrapper, /fetch\(|fetchAuthRequestJson|verify-code|send-code/);
  assert.match(flow, /if \(directLogin\) \{[\s\S]*?<DirectLoginExperience/);
});

test("the login visual matches the approved quiet life-scene direction", () => {
  for (const copy of ["欢迎来到忆见", "登录后，开始留下关于 TA 的记忆。", "手机号", "验证码", "发送验证码", "继续", "返回首页", "《用户协议》", "《隐私政策》"]) {
    assert.match(surface, new RegExp(copy));
  }
  assert.match(surface, /owner-confirmed-warm-presence\.png/);
  assert.match(styles, /object-fit: cover/);
  assert.match(styles, /rgba\(250, 246, 240, 0\.96\)/);
  assert.doesNotMatch(surface, /星空|粒子|AI 工具|轻轻相遇中|正在进入忆见/);
  assert.doesNotMatch(styles, /linear-gradient\([^;]*purple|#7c3aed|neon/i);
});

test("the mobile login keeps accessible focus, compact controls, and reduced motion", () => {
  assert.match(styles, /min-height: 100dvh/);
  assert.match(styles, /overflow-x: hidden/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /@media \(max-height: 740px\)/);
  assert.match(surface, /aria-live="polite"/);
});

test("the formal consent, SMS, session, and explicit continuation contracts remain in the shared flow", () => {
  assert.match(flow, /resolveSmsLoginAction\(loginAgreementAccepted\)/);
  assert.match(flow, /fetchAuthRequestJson\("\/api\/auth\/send-code"/);
  assert.match(flow, /fetchAuthRequestJson\("\/api\/auth\/verify-code"/);
  assert.match(flow, /credentials: "same-origin"/);
  assert.match(flow, /if \(onAuthenticated\) await onAuthenticated\(\)/);
  assert.match(flow, /else router\.replace\("\/"\)/);
  assert.doesNotMatch(flow, /resolvePostLoginDestination/);
  assert.match(surface, /agreementAccepted/);
  assert.doesNotMatch(surface, /fetch\(|response\.json\(/);
});
