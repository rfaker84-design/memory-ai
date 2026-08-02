import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("generated canonical surfaces retain the non-impersonation disclosure and legacy unsafe surfaces are quarantined", () => {
  for (const source of [
    "src/components/first-presence/FirstPresenceFlow.tsx",
    "src/components/first-presence/MemoryConversationScene.tsx",
  ]) assert.match(readFileSync(source, "utf8"), /AiGeneratedLabel/);
  const label = readFileSync("src/components/safety/AiGeneratedLabel.tsx", "utf8");
  assert.match(label, /AI 生成内容/);
  assert.match(label, /不代表真实人物/);
  assert.match(label, /AI生成 · 基于已确认资料/);
  for (const source of ["app/avatar/[id]/page.tsx", "app/heirloom/[id]/page.tsx", "app/share/[id]/page.tsx"]) {
    const page = readFileSync(source, "utf8");
    assert.match(page, /redirect\("\/"\)/);
    assert.doesNotMatch(page, /legacy-supabase|supabase/i);
  }
});
