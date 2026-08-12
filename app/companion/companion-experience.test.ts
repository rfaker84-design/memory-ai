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

test("companion space is not an IM transcript and exposes the three honest next steps", () => {
  assert.match(page, /TA 在这里/);
  assert.match(page, />陪 TA 聊聊</);
  assert.match(page, />看看拾忆</);
  assert.match(page, />查看影像机会</);
  assert.match(page, /生成新的影像前/);
  const nextSteps = page.slice(page.indexOf('<nav className={styles.nextSteps}'), page.indexOf('</nav>'));
  assert.equal((nextSteps.match(/<button\b/g) ?? []).length, 3);
  assert.match(nextSteps, /router\.push\(chatRoute\)/);
  assert.match(nextSteps, /router\.push\(`\/memory\/\$\{encodeURIComponent\(memory\.id\)\}\/pickup`\)/);
  assert.match(nextSteps, /router\.push\(companionVideoEntry\(memory\.id\)\)/);
  assert.match(nextSteps, /生成新的影像前，正式入口会核验照片、完整对话与可用影像机会/);
  assert.doesNotMatch(page, /messages\.map|聊天气泡|ChatGPT|contentEditable/);
  assert.doesNotMatch(page, /<main/);
});

test("first and daily visits persist as presentation-only state with an associated AI disclosure", () => {
  assert.match(page, /companionVisitGreeting\(memory\.name, visitState\)/);
  assert.match(page, /data-visit=\{visitState\}/);
  assert.match(page, /resolveCompanionVisitState\(readPresentationValue\(visitStorageKey\)\)/);
  assert.match(page, /writePresentationValue\(visitStorageKey, COMPANION_VISIT_MARKER\)/);
  assert.match(page, /aria-describedby="today-companion-disclosure"/);
  assert.match(page, /id="today-companion-disclosure"/);
  assert.match(page, /greeting\.disclosure/);
  assert.match(page, /AI 纪念陪伴/);
});

test("recent interaction stays an honest empty state instead of creating or summarizing a conversation", () => {
  assert.match(page, /最近一次交流/);
  assert.match(page, /当前没有可安全展示的只读摘要/);
  assert.match(page, /不会为预览创建会话/);
  assert.match(page, /\/memory\/\$\{encodeURIComponent\(memory\.id\)\}\/sources/);
  assert.match(page, />查看已确认资料</);
  assert.doesNotMatch(page, /loadConversation|recentCompletedInteraction|\/chat-session/);
});

test("formal owner and media reads fail closed without creating a parallel backend", () => {
  assert.match(page, /fetchCompanionHomeMemoriesJson\(fetch, signal\)/);
  assert.match(page, /selectPrimaryCompanion/);
  assert.match(page, /loadOwnedMediaUrl\(selected\.photoAssetId, signal\)/);
  assert.match(page, /response\.status === 401/);
  assert.doesNotMatch(page, /loadCommerceCreditBalance|\/api\/commerce\/credits/);
  assert.doesNotMatch(page, /\/api\/(payments|first-presence-video)|method:\s*"POST"|method:\s*"PATCH"/);
});

test("presentation storage failure cannot block the Owner-scoped companion page", () => {
  assert.match(page, /function readPresentationValue[\s\S]*?catch \{[\s\S]*?return null/);
  assert.match(page, /function writePresentationValue[\s\S]*?catch \{[\s\S]*?Presentation preferences must never block/);
});

test("quiet motion degrades for reduced motion and constrained devices", () => {
  assert.match(page, /<MotionProvider>[\s\S]*<CompanionContent \/>[\s\S]*<\/MotionProvider>/);
  assert.match(page, /useQuietCompanionPresence/);
  assert.match(page, /data-presence=\{presence\}/);
  assert.match(styles, /data-presence="quiet"/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("mobile safe areas, long names, and supporting copy remain usable on narrow screens", () => {
  assert.match(styles, /calc\(18px \+ env\(safe-area-inset-top, 0px\)\)/);
  assert.match(styles, /identityBar > div:nth-child\(2\) \{ min-width: 0; \}/);
  assert.match(styles, /aiIdentity[\s\S]*?white-space: nowrap/);
  for (const opacity of ["0.66", "0.64"]) assert.match(styles, new RegExp(`rgba\\([^)]*, ${opacity}\\)`));
});
