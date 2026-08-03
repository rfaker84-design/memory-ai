import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginSurface = readFileSync(new URL("./OriginalHomeLogin.tsx", import.meta.url), "utf8");
const homeLoginStyles = readFileSync(new URL("./HomeLogin.module.css", import.meta.url), "utf8");

test("the formal login surface does not import the retired world or personality shell", () => {
  assert.doesNotMatch(loginSurface, /WorldShell|personality|Canvas|@react-three/);
  assert.match(loginSurface, /radial-gradient/);
});

test("the login surface keeps its formal consent, session, and recovery contract", () => {
  for (const copy of ["你的记忆世界", "每一次回来，都是重逢", "获取验证码", "《用户协议》", "《隐私政策》", "/help"]) {
    assert.match(loginSurface, new RegExp(copy));
  }
  assert.match(loginSurface, /if \(!agreementAccepted\)/);
  assert.match(loginSurface, /authRequest\("\/api\/auth\/send-code"/);
  assert.match(loginSurface, /authRequest\("\/api\/auth\/verify-code"/);
  assert.match(loginSurface, /credentials: "same-origin"/);
  assert.match(loginSurface, /AUTH_REQUEST_TIMEOUT_MS = 12_000/);
  assert.match(loginSurface, /AbortController/);
  assert.match(loginSurface, /signal: controller\.signal/);
  assert.match(loginSurface, /if \(sending \|\| code\.length !== 6 \|\| !challengeId\) return/);
  assert.match(loginSurface, /smsSendFailureNotice/);
  assert.match(loginSurface, /网络连接暂时中断/);
});

test("the WeChat visual override is explicit and cannot enter production", () => {
  assert.match(loginSurface, /process\.env\.NODE_ENV !== "production"/);
  assert.match(loginSurface, /NEXT_PUBLIC_MEMORYAI_LOGIN_VISUAL_STATE === "wechat-available"/);
  assert.match(loginSurface, /window\.location\.assign\(action\.href\)/);
});

test("the static login treatment retains accessible keyboard focus and desktop layout", () => {
  assert.match(homeLoginStyles, /\.checkboxInput:checked \+ \.checkboxVisual/);
  assert.match(homeLoginStyles, /\.checkboxInput\s*\{[\s\S]*opacity: 0/);
  assert.match(homeLoginStyles, /\.legalLink\s*\{[\s\S]*text-decoration: underline/);
  assert.match(homeLoginStyles, /@media \(min-width: 900px\)/);
  assert.match(homeLoginStyles, /max-width: 440px/);
});
