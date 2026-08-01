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
});
