import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../src/components/MobileAppShell.tsx", import.meta.url), "utf8");
const world = readFileSync(new URL("../memory-world/page.tsx", import.meta.url), "utf8");

test("memory-world enters the dedicated companion space and the four-tab shell keeps it active", () => {
  assert.match(world, /router\.push\("\/companion"\)/);
  assert.match(shell, /path:"\/companion"/);
  assert.match(shell, /pathname === "\/companion"/);
  const tabs = shell.slice(shell.indexOf("const TABS"), shell.indexOf("];", shell.indexOf("const TABS")));
  assert.equal((tabs.match(/key:/g) ?? []).length, 4);
  for (const path of ["/", "/companion", "/memory", "/continuity"]) assert.match(tabs, new RegExp(`path:"${path}"`));
  for (const label of ["首页", "相伴", "拾忆", "我的"]) assert.match(shell, new RegExp(`label:"${label}"`));
  assert.match(shell, /if \(t\.key === "home"\) return pathname === "\/"/);
  assert.doesNotMatch(shell, /components\/ui\/BottomTab/);
});

test("companion presents one warm Owner portrait scene without status gamification", () => {
  assert.match(page, /className=\{styles\.heroMedia\}/);
  assert.match(page, /portraitUrl[\s\S]*?<CompanionMotionBackground/);
  assert.match(page, /variant="idle"/);
  assert.match(page, /motionEnabled=\{!reducedMotion\}/);
  assert.match(page, /想对 \{memory\.name\} 说的话/);
  assert.match(page, /AI生成 · 基于你确认的信息/);
  assert.match(styles, /\.heroMotion[\s\S]*?filter: saturate/);
  assert.doesNotMatch(page, /相伴多少天|在线|亲密度|礼物|热度|陪伴时长|连续天数|打卡|等级|视频通话|语音通话|送礼物/);
  assert.doesNotMatch(styles, /stars|portraitHalo|radial-gradient\(circle at 50% 28%/);
});

test("the restrained paper surface keeps formal chat pickup and video-opportunity routes", () => {
  assert.match(page, /今天想从哪件小事说起？/);
  assert.match(page, /说点想让 \{memory\.name\} 知道的话/);
  assert.match(page, /最近拾忆/);
  assert.match(page, /影像机会/);
  assert.match(page, /const chatRoute = `\/memory-chat\/\$\{encodeURIComponent\(memory\.id\)\}`/);
  assert.match(page, /const pickupRoute = `\/memory\/\$\{encodeURIComponent\(memory\.id\)\}\/pickup`/);
  assert.match(page, /router\.push\(companionVideoEntry\(memory\.id\)\)/);
  assert.doesNotMatch(page, /quietEntries/);
  assert.doesNotMatch(page, /messages\.map|聊天气泡|ChatGPT|contentEditable|video-call|voice-call/);
});

test("recent pickup is an Owner-scoped bounded read with an honest empty state", () => {
  assert.match(page, /fetchPickupRequestJson\(`\/api\/memories\/\$\{encodeURIComponent\(selected\.id\)\}\/pickups`/);
  assert.match(page, /Array\.isArray\(pickups\) \? pickups\[0\]/);
  assert.match(page, /memoryCollectionTitle\(latestPickup\.organizedText\)/);
  assert.match(page, /由你确认/);
  assert.match(page, /只有你确认的内容，才会留在拾忆里/);
  assert.match(page, /loadOwnedMediaUrl\(recent\.photoAssetId, signal\)/);
  assert.doesNotMatch(page, /method:\s*"(?:POST|PATCH|DELETE)"|\/chat-session/);
});

test("first and daily visits remain presentation-only and disclose generated content", () => {
  assert.match(page, /companionVisitGreeting\(memory\.name, visitState\)\.disclosure/);
  assert.match(page, /data-visit=\{visitState\}/);
  assert.match(page, /resolveCompanionVisitState\(readPresentationValue\(visitStorageKey\)\)/);
  assert.match(page, /writePresentationValue\(visitStorageKey, COMPANION_VISIT_MARKER\)/);
  assert.match(page, /id="today-companion-disclosure"/);
  assert.match(page, /不会把生成内容当作真人的真实表达/);
});

test("formal Owner and media reads fail closed without a parallel backend", () => {
  assert.match(page, /fetchCompanionHomeMemoriesJson\(fetch, signal\)/);
  assert.match(page, /resolveCompanionPrimaryPreference/);
  assert.match(page, /memories\.length > 1 && selection\?\.needsExplicitChoice/);
  assert.match(page, /router\.replace\("\/memory-world"\)/);
  assert.doesNotMatch(page, /selected\s*=\s*memories\[0\]/);
  assert.match(page, /loadOwnedMediaUrl\(selected\.photoAssetId, signal\)/);
  assert.match(page, /response\.status === 401/);
  assert.doesNotMatch(page, /loadCommerceCreditBalance|\/api\/commerce\/credits/);
  assert.doesNotMatch(page, /\/api\/payments/);
});

test("presentation storage failure cannot block the Owner-scoped companion page", () => {
  assert.match(page, /function readPresentationValue[\s\S]*?catch \{[\s\S]*?return null/);
  assert.match(page, /function writePresentationValue[\s\S]*?catch \{[\s\S]*?Presentation preferences must never block/);
});

test("Staging motion debug receives one read-only selected-memory decision snapshot", () => {
  assert.match(page, /function stagingMotionDebugRequested/);
  assert.match(page, /companionPrimaryStorageKey\(ownerId\)/);
  assert.match(page, /readPresentationValue\(scopedKey\)/);
  assert.match(page, /readPresentationValue\(COMPANION_PRIMARY_KEY\)/);
  assert.match(page, /resolverSource: selection\?\.source/);
  assert.match(page, /createdAt: entry\.createdAt \?\? null/);
  assert.match(page, /selectionDebug=\{motionDebugSelection\}/);
  assert.doesNotMatch(page, /setMotionDebugSelection[\s\S]*?localStorage\.(?:setItem|removeItem)/);
});

test("ambient movement is subtle and fully stops for reduced motion", () => {
  assert.match(page, /<MotionProvider>[\s\S]*<CompanionContent \/>[\s\S]*<\/MotionProvider>/);
  assert.match(page, /useQuietCompanionPresence/);
  assert.match(page, /data-presence=\{presence\}/);
  assert.match(styles, /data-presence="quiet"[\s\S]*?presenceDrift 12s ease-in-out infinite alternate/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important/);
  assert.doesNotMatch(styles, /filter:\s*blur/);
});

test("mobile safe areas, narrow widths and long Owner content stay usable", () => {
  assert.match(styles, /env\(safe-area-inset-top, 0px\)/);
  assert.match(styles, /env\(safe-area-inset-bottom, 0px\)/);
  assert.match(styles, /@media \(max-width: 374px\)/);
  assert.match(styles, /\.memoryPreview > span[\s\S]*?min-width: 0/);
  assert.match(styles, /\.heroCopy h1[\s\S]*?overflow-wrap: anywhere/);
  assert.match(styles, /\.heroCopy p[\s\S]*?max-width: 100%/);
  assert.match(styles, /text-overflow: ellipsis/);
  assert.doesNotMatch(styles, /:has\(/);
});
