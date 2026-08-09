import assert from "node:assert/strict";
import test from "node:test";

import {
  clearChatPickupDraft,
  consumeChatPickupDraft,
  stageChatPickupDraft,
} from "./pickupDraftHandoff";

test("a selected chat sentence is carried once in memory and never becomes durable by staging alone", () => {
  clearChatPickupDraft();
  assert.equal(stageChatPickupDraft({
    memoryId: "memory-a",
    sourceMessageId: "message-a",
    originalText: "  妈妈以前会在下雨天接我放学。  ",
    createdAt: "2026-08-09T08:00:00.000Z",
  }), true);
  assert.equal(consumeChatPickupDraft("memory-b"), null);
  assert.deepEqual(consumeChatPickupDraft("memory-a"), {
    memoryId: "memory-a",
    sourceMessageId: "message-a",
    originalText: "妈妈以前会在下雨天接我放学。",
    createdAt: "2026-08-09T08:00:00.000Z",
  });
  assert.equal(consumeChatPickupDraft("memory-a"), null);
});

test("empty or oversized chat text is never staged", () => {
  clearChatPickupDraft();
  assert.equal(stageChatPickupDraft({ memoryId: "memory-a", sourceMessageId: "message-a", originalText: " " }), false);
  assert.equal(stageChatPickupDraft({ memoryId: "memory-a", sourceMessageId: "message-a", originalText: "x".repeat(8_001) }), false);
  assert.equal(consumeChatPickupDraft("memory-a"), null);
});
