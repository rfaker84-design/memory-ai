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
  assert.match(source, /忆见正在整理回复/);
  assert.doesNotMatch(source, /\$\{memoryName\} 正在回应/);
});
