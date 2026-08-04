import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("understanding assistance recovery links meet the global touch-target contract", () => {
  const styles = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /a\[href="\/settings\/companion"\], a\[href="\/settings\/understanding-assistance"\]/);
  assert.match(styles, /min-height:44px/);
});

test("understanding assistance UI uses the protected minimal-state route and never claims automatic outreach", () => {
  const panel = readFileSync(new URL("./UnderstandingAssistancePanel.tsx", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../first-presence/MemoryConversationScene.tsx", import.meta.url), "utf8");
  assert.match(panel, /\/api\/account\/understanding-assistance/);
  assert.match(panel, /ENABLE_UNDERSTANDING_ASSISTANCE/);
  assert.match(panel, /REVOKE_UNDERSTANDING_ASSISTANCE/);
  assert.match(panel, /不会自动通知或联系任何人/);
  assert.match(chat, /hasExplicitAssistanceRequest\(message\)/);
  assert.match(chat, /再给我解释一次/);
  assert.match(chat, /暂时不操作/);
  assert.match(chat, /请可信任的人协助/);
  assert.doesNotMatch(`${panel}\n${chat}`, /心智能力不足|精神异常|民事行为能力/);
});
