import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./MemoryConversationScene.tsx", import.meta.url), "utf8");

test("a pickup suggestion is dismissed for the rest of a session when the user continues chatting", () => {
  assert.match(source, /completedConversationRounds\(messages, activeSessionId\) > 1/);
  assert.match(source, /window\.sessionStorage\.setItem\(viewKey, "dismissed"\)/);
  assert.match(source, /setPickupSuggestionVisible\(false\)/);
  assert.match(source, /explicit product-level ignore for this session/);
});
