import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worldShell = readFileSync(new URL("./WorldShell.tsx", import.meta.url), "utf8");
const homeLoginStyles = readFileSync(new URL("./HomeLogin.module.css", import.meta.url), "utf8");
const soulBody = readFileSync(new URL("../memory/MemorySoulBody.tsx", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");

test("the starry login keeps its form without the humanoid placeholder", () => {
  assert.match(worldShell, /你的记忆世界/);
  assert.match(worldShell, /每一次回来，都是重逢/);
  assert.match(worldShell, /<HomeOverlay/);
  assert.doesNotMatch(worldShell, /MemorySoulBody|state="empty"/);
});

test("the complete login surface keeps the frozen content order and formal links", () => {
  const orderedCopy = [
    "你的记忆世界",
    "每一次回来，都是重逢",
    "微信一键登录",
    "或使用手机号登录",
    "输入手机号",
    "获取验证码",
    "我已阅读并同意",
    "/terms",
    "/privacy",
    "未注册的手机号验证后将自动创建忆见账号",
  ];
  let previous = -1;
  for (const copy of orderedCopy) {
    const index = worldShell.indexOf(copy);
    assert.ok(index > previous, `${copy} must follow the prior frozen item`);
    previous = index;
  }
  assert.match(worldShell, /useState\(false\)/);
  assert.match(worldShell, /resolveWeChatLoginAction\(agreementAccepted, wechatProviderState\)/);
  assert.match(worldShell, /wechatProviderState === "available" &&/);
  assert.doesNotMatch(worldShell, /WECHAT_AUTH_UNAVAILABLE_NOTICE|微信登录暂未开放/);
  assert.ok(
    worldShell.indexOf("if (!agreementAccepted)") < worldShell.indexOf('fetch("/api/auth/send-code"'),
    "the agreement guard must run before the SMS request",
  );
  assert.match(nextConfig, /devIndicators: false/);
});

test("the visual provider override is explicit and cannot enter production", () => {
  assert.match(worldShell, /process\.env\.NODE_ENV !== "production"/);
  assert.match(
    worldShell,
    /process\.env\.NEXT_PUBLIC_MEMORYAI_LOGIN_VISUAL_STATE === "wechat-available"/,
  );
  assert.match(
    worldShell,
    /if \(WECHAT_LOGIN_VISUAL_PREVIEW_AVAILABLE\) \{\s*setWechatProviderState\("available"\);\s*return;/,
  );
  assert.match(worldShell, /window\.location\.assign\(action\.href\)/);
});

test("the login treatment scales on desktop without turning the WeChat surface green", () => {
  assert.match(homeLoginStyles, /\.overlay::before/);
  assert.match(homeLoginStyles, /radial-gradient/);
  assert.match(homeLoginStyles, /@media \(min-width: 900px\)/);
  assert.match(homeLoginStyles, /max-width: 440px/);
  assert.match(homeLoginStyles, /font-size: 34px/);
  assert.match(homeLoginStyles, /\.wechatButton\s*\{[\s\S]*background: rgba\(255, 243, 232, 0\.045\)/);
  assert.doesNotMatch(homeLoginStyles, /border[^;]*rgba\(7,\s*193,\s*96/);
});

test("the agreement control is custom, readable, and keeps distinct formal links", () => {
  assert.match(worldShell, /className=\{homeLoginStyles\.checkboxInput\}/);
  assert.match(worldShell, /className=\{homeLoginStyles\.checkboxVisual\}/);
  assert.match(homeLoginStyles, /\.checkboxInput:checked \+ \.checkboxVisual/);
  assert.match(homeLoginStyles, /\.checkboxInput\s*\{[\s\S]*opacity: 0/);
  assert.match(homeLoginStyles, /\.agreementRow\s*\{[\s\S]*font-size: 12\.5px/);
  assert.match(homeLoginStyles, /\.legalLink\s*\{[\s\S]*text-decoration: underline/);
});

test("the removed login-only empty state leaves no text or animation behind", () => {
  const loginSources = `${worldShell}\n${soulBody}`;

  assert.doesNotMatch(loginSources, /等待一段记忆被唤醒/);
  assert.doesNotMatch(loginSources, /soulEmptyBreath|soulFlicker/);
  assert.doesNotMatch(soulBody, /"empty"/);
});

test("the login content is vertically balanced while the creation states remain available", () => {
  assert.match(homeLoginStyles, /\.overlay\s*\{[\s\S]*align-items: center[\s\S]*justify-content: center/);
  assert.match(homeLoginStyles, /padding: 42px 20px 82px/);
  assert.match(homeLoginStyles, /@media \(max-height: 720px\) and \(max-width: 899px\)/);
  assert.match(soulBody, /"collecting" \| "forming" \| "ready"/);
  assert.match(soulBody, /state === "forming"/);
});
