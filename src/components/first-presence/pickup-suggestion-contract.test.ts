import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./MemoryConversationScene.tsx", import.meta.url), "utf8");

test("a pickup suggestion is shown at most once per session, including silent ignore", () => {
  assert.match(source, /completedConversationRounds\(messages, activeSessionId\) > 1/);
  assert.match(source, /if \(window\.sessionStorage\.getItem\(viewKey\)\)/);
  assert.match(source, /window\.sessionStorage\.setItem\(viewKey, "shown"\)/);
  assert.match(source, /window\.sessionStorage\.setItem\(viewKey, "dismissed"\)/);
  assert.match(source, /setPickupSuggestionVisible\(false\)/);
  assert.match(source, /must not turn silence into a nudge/);
});

test("only a user-selected chat sentence can enter the explicit pickup draft handoff", () => {
  assert.match(source, /message\.role === "user" && \(/);
  assert.match(source, /stageChatPickupDraft\(\{/);
  assert.match(source, /sourceMessageId: message\.id/);
  assert.match(source, /originalText: message\.content/);
  assert.match(source, /\/pickup\?from=chat/);
  assert.match(source, />\s*保存这一刻\s*<\/Link>/);
  assert.doesNotMatch(source, /stageChatPickupDraft[\s\S]{0,160}(?:POST|confirmed: true)/);
});
