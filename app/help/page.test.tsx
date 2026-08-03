import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const help = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const footer = readFileSync(new URL("../../components/Footer.tsx", import.meta.url), "utf8");
const continuity = readFileSync(new URL("../(continuity)/continuity/page.tsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../../src/components/first-presence/FirstPresenceFlow.tsx", import.meta.url), "utf8");

test("help content gives a real, safe support path for first-use and failures", () => {
  for (const value of [
    "AI 纪念内容",
    "20MB",
    "首次影像可能需要排队和人工审核",
    "身份证号、银行卡号、密码、验证码",
    "请求编号",
    "href=\"/report\"",
  ]) assert.match(help, new RegExp(value));
  for (const value of [
    "常见问题",
    "不是。忆见提供的是 AI 纪念陪伴内容",
    "聊天内容会自动成为长期记忆吗？",
    "未发送的文字会保留在输入框中",
    "投诉、退款或数据权利请求",
  ]) assert.match(help, new RegExp(value));
  assert.match(help, /公开首发不收集声音、不录音，也不提供声音克隆/);
  assert.doesNotMatch(help, /照片和声音会在正式创建后上传/);
});

test("help is reachable from the shared footer, login, and personal settings", () => {
  assert.match(footer, /href="\/help"/);
  assert.match(login, /href="\/help"/);
  assert.match(continuity, /router\.push\("\/help"\)/);
  assert.match(continuity, /router\.push\("\/about"\)/);
  assert.doesNotMatch(continuity, /label:"关于忆见",action:\(\)=>\{\}/);
});
