import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./[id]/pickup/page.tsx", import.meta.url), "utf8");
const index = readFileSync(new URL("../(memory)/memory/page.tsx", import.meta.url), "utf8");

test("pickup is an explicit-confirmation flow and never relies on ordinary-chat or browser persistence", () => {
  assert.match(source, /confirmed: true/);
  assert.match(source, /idempotency-key/);
  assert.match(source, /原话与整理稿准确/);
  assert.match(source, /按原话分段整理草稿/);
  assert.match(source, /忆见整理助手/);
  assert.match(source, /每次整理最多提出这一项追问/);
  assert.match(source, /你的主动讲述与明确确认/);
  assert.match(source, /<dt>叙述者<\/dt><dd>你<\/dd>/);
  assert.match(source, /已经替你收好了/);
  assert.match(source, /不会读取相册、麦克风或录音/);
  assert.match(source, /const initialize = useCallback/);
  assert.match(source, /void initialize\(controller\.signal\)/);
  assert.match(source, /function TouchButton[\s\S]*?minHeight: 44/);
  assert.match(source, /state === "error" && <TouchButton[^>]*onClick=\{\(\) => void initialize\(\)\}>重新读取<\/TouchButton>/);
  assert.match(source, /编辑/);
  assert.match(source, /删除/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /getUserMedia|MediaRecorder|audio\//);
  assert.doesNotMatch(source, /memory-chat/);
  assert.match(index, /把想起的事/);
  assert.match(index, /保存这一刻/);
  assert.match(index, /普通聊天不会自动写进来/);
  assert.match(index, /从一件小事说起/);
  assert.match(index, /从一张照片说起/);
  assert.match(index, /buildConfirmedMemoryCollection/);
  assert.match(index, /fetchPickupRequestJson/);
  assert.match(index, /已经确认的忆/);
  assert.match(index, /item\.organizedText/);
  assert.match(index, /item\.createdAt/);
  assert.match(index, /你的主动讲述与明确确认/);
  assert.match(index, /confirmed · TA 可引用/);
  assert.match(index, /拾忆暂时没有打开/);
  assert.match(index, /onClick=\{\(\) => void load\(\)\}/);
  assert.match(index, /response\.status === 401/);
  assert.match(index, /setState\("unauthenticated"\)/);
  assert.match(index, /state === "unauthenticated"[\s\S]*?<Link href="\/login">/);
  assert.match(index, /\/pickup/);
});

test("a selected chat sentence stays a draft until the existing confirmation POST succeeds", () => {
  assert.match(source, /startsFromChat = searchParams\.get\("from"\) === "chat"/);
  assert.match(source, /consumeChatPickupDraft\(memoryId\)/);
  assert.match(source, /setOriginalText\(selected\.originalText\)/);
  assert.match(source, /setOrganizedText\(organizationDraft\(selected\.originalText\)\)/);
  assert.match(source, /当前仍是 draft；只有你确认后才会保存/);
  assert.match(source, /disabled=\{!confirmed \|\| submitting/);
  assert.match(source, /body: JSON\.stringify\(\{ originalText, organizedText, confirmed: true/);
  assert.match(source, /router\.push\("\/memory"\)/);
});
