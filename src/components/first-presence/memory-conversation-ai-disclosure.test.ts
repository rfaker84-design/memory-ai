import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./MemoryConversationScene.tsx", import.meta.url), "utf8");

test("continuous memorial chat keeps an accessible low-weight AI identity disclosure visible", () => {
  assert.match(source, /<span role="note">AI生成 · 基于你确认的记忆<\/span>/);
  assert.ok(
    source.indexOf('AI生成 · 基于你确认的记忆') < source.indexOf("<div className={styles.messages}"),
    "disclosure must precede conversation messages",
  );
  assert.ok((source.match(/AI生成 · 基于你确认的记忆/g) ?? []).length >= 2);
  assert.match(source, /function supportRequestId\(error: unknown\): string \| null/);
  assert.match(source, /failureRequestId && <p className=\{styles\.alert\} role="status">请求编号：\{failureRequestId\}<\/p>/);
  assert.match(source, /查看资料来源/);
  assert.match(source, /\/memory\/\$\{memoryId\}\/sources/);
  assert.match(source, /import \{ CRISIS_RESPONSE \} from "@\/features\/memory-engine\/crisis-response"/);
  assert.match(source, /function isSafetyAssistantMessage\(message: ConversationMessage\)/);
  assert.match(source, /忆见安全陪伴助手/);
  assert.match(source, /安全支持 · 不代表 TA/);
  assert.match(source, /isSafetyAssistantMessage\(message\) \? \([\s\S]*?<i>忆见安全陪伴助手<\/i>[\s\S]*?\) : \([\s\S]*?<i>\{memoryName\}<\/i>/);
  assert.match(source, /isSafetyAssistantMessage\(message\) && \([\s\S]*?href="\/help"[\s\S]*?href="\/settings\/companion"/);
  assert.match(source, /不替代紧急服务，也不表示已经通知外部人员/);
  assert.match(source, /忆见正在整理回复/);
  assert.doesNotMatch(source, /\$\{memoryName\} 正在回应/);
});
