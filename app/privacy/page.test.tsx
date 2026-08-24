import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("privacy disclosure distinguishes content deletion, backup rotation, financial isolation and auditable provider deletion", () => {
  for (const expected of ["7 天", "30 天", "90 天", "删除墓碑", "legal hold", "供应商", "可审计结果"]) {
    assert.match(source, new RegExp(expected));
  }
  assert.match(source, /href="\/report"/);
  assert.match(source, /href="\/authorization"/);
  assert.match(source, /公开首发不收集声音、不录音，也不提供声音克隆/);
  assert.doesNotMatch(source, /TA、聊天、照片、声音和视频会停止使用/);
  for (const value of ["公开影像分享", "只有资料管理者主动", "默认不被搜索收录", "不提供原始文件下载", "撤销后页面和播放都会立即不可访问"]) assert.match(source, new RegExp(value));
  assert.doesNotMatch(source, /候选/);
});
