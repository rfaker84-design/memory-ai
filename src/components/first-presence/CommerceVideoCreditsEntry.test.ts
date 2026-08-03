import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entry = readFileSync(new URL("./CommerceVideoCreditsEntry.tsx", import.meta.url), "utf8");
const scene = readFileSync(new URL("./MemoryConversationScene.tsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("../../../app/commerce-entry-preview/page.tsx", import.meta.url), "utf8");
const previewShell = readFileSync(new URL("./CommerceEntryPreviewShell.tsx", import.meta.url), "utf8");
const view = readFileSync(new URL("./CommerceVideoCreditsEntryView.tsx", import.meta.url), "utf8");
const balanceState = readFileSync(new URL("./commerceVideoCreditsEntryState.ts", import.meta.url), "utf8");
const entryCopy = balanceState + view;

test("two completed active-session rounds are the only first-presence entry gate", () => {
  assert.match(scene, /completedRounds >= 2 && activeSessionId/);
  assert.match(scene, /<CommerceVideoCreditsEntry memoryId=\{memoryId\} \/>/);
  assert.match(view, /文字之外，还可以留下一段新的影像。/);
  assert.doesNotMatch(scene, /MemoryExperienceOffer|\/api\/payments\//);
});

test("entry is restrained, Commerce-backed, and does not pressure chat continuation", () => {
  for (const copy of [
    "本次体验机会已经用完",
    "想继续留住TA的更多模样",
    "可以邀请3位朋友获得1次不可保存的体验机会，或选择影像次数。",
    "邀请朋友",
    "选择影像次数",
    "额度永久有效",
    "生成成功才消耗",
    "一次性购买，不自动续费",
    "不同设备、不同已验证手机号",
    "不是分享一次立即到账",
    "使用现有额度生成影像",
  ]) {
    assert.match(entryCopy, new RegExp(copy));
  }
  assert.doesNotMatch(entryCopy, /MemoryExperienceOffer|\/api\/payments\/|30天|100次 AI 回复|倒计时|自动续费之外/);
  assert.match(entry, /loadCommerceCreditBalance/);
  assert.match(entry, /createCommerceVideoOrder/);
  assert.match(entry, /createReferralCode/);
  assert.match(entry, /platform === "ios"/);
  assert.match(entry, /resolveCommerceVideoCreditsBalanceState/);
  assert.doesNotMatch(entry, /availableVideoCredits/);
});

test("the visual acceptance page is unavailable in production without its exact non-production flag", () => {
  assert.match(preview, /process\.env\.NODE_ENV === "production"/);
  assert.match(preview, /COMMERCE_ENTRY_PREVIEW_MODE !== "true"/);
  assert.match(preview, /notFound\(\)/);
  assert.match(previewShell, /内部验收预览：余额状态切换/);
  assert.match(previewShell, /"loading"/);
  assert.match(previewShell, /"available"/);
  assert.match(previewShell, /"empty"/);
  assert.match(previewShell, /"unavailable"/);
});
