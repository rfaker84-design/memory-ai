import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("generated first-presence, avatar and letter surfaces retain the non-impersonation disclosure", () => {
  for (const source of [
    "src/components/first-presence/FirstPresenceFlow.tsx",
    "app/avatar/[id]/page.tsx",
    "app/heirloom/[id]/page.tsx",
  ]) assert.match(readFileSync(source, "utf8"), /AiGeneratedLabel/);
  const label = readFileSync("src/components/safety/AiGeneratedLabel.tsx", "utf8");
  assert.match(label, /AI 生成内容/);
  assert.match(label, /不代表真实人物/);
});
