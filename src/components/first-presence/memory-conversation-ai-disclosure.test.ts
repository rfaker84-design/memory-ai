import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./MemoryConversationScene.tsx", import.meta.url), "utf8");

test("continuous memorial chat keeps an accessible AI identity disclosure visible", () => {
  assert.match(source, /import \{ AiGeneratedLabel \} from "\.\.\/safety\/AiGeneratedLabel"/);
  assert.match(source, /<AiGeneratedLabel\s*\/>/);
  assert.ok(
    source.indexOf("<AiGeneratedLabel />") < source.indexOf("<div className={styles.messages}"),
    "disclosure must precede conversation messages",
  );
  assert.match(source, /<AiGeneratedLabel compact confirmedSources \/>/);
  assert.match(source, /查看资料来源/);
  assert.match(source, /\/memory\/\$\{memoryId\}\/sources/);
  assert.match(source, /import \{ CRISIS_RESPONSE \} from "@\/features\/memory-engine\/crisis-response"/);
  assert.match(source, /function isSafetyAssistantMessage\(message: ConversationMessage\)/);
  assert.match(source, /忆见安全陪伴助手/);
  assert.match(source, /安全支持 · 不代表 TA/);
  assert.match(source, /isSafetyAssistantMessage\(message\) \? \([\s\S]*?<i>忆见安全陪伴助手<\/i>[\s\S]*?\) : \([\s\S]*?<MemoryAvatar/);
  assert.match(source, /忆见正在整理回复/);
  assert.doesNotMatch(source, /\$\{memoryName\} 正在回应/);
});
