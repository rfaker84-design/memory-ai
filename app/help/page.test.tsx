import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const help = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const footer = readFileSync(new URL("../../components/Footer.tsx", import.meta.url), "utf8");
const continuity = readFileSync(new URL("../(continuity)/continuity/page.tsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../../components/world/WorldShell.tsx", import.meta.url), "utf8");

test("help content gives a real, safe support path for first-use and failures", () => {
  for (const value of [
    "AI 纪念内容",
    "20MB",
    "首次影像可能需要排队和人工审核",
    "身份证号、银行卡号、密码、验证码",
    "请求编号",
    "href=\"/report\"",
  ]) assert.match(help, new RegExp(value));
});

test("help is reachable from the shared footer, login, and personal settings", () => {
  assert.match(footer, /href="\/help"/);
  assert.match(login, /href="\/help"/);
  assert.match(continuity, /router\.push\("\/help"\)/);
  assert.match(continuity, /router\.push\("\/about"\)/);
  assert.doesNotMatch(continuity, /label:"关于忆见",action:\(\)=>\{\}/);
});
