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
  assert.match(source, /来源：你的主动讲述/);
  assert.match(source, /叙述者：你/);
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
  assert.match(index, /把想起的事留在这里/);
  assert.match(index, /从一件小事说起/);
  assert.match(index, /从一张照片说起/);
  assert.match(index, /flexWrap: "wrap"/);
  assert.match(index, /暂时无法读取 TA/);
  assert.match(index, /onClick=\{\(\) => void load\(\)\}/);
  assert.match(index, /response\.status === 401/);
  assert.match(index, /setState\("unauthenticated"\)/);
  assert.match(index, /state === "unauthenticated"[\s\S]*?<Link href="\/login">/);
  assert.match(index, /\/pickup/);
});
