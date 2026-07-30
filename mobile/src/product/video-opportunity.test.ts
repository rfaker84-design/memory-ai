import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  FirstPresenceVideoSafeDto,
  ProductConversation,
} from "./api";
import {
  resolveMobileVideoOpportunities,
  saveAllowedForMobileVideo,
} from "./video-opportunity";

const sessionId = "session-1";

function conversation(messages: ProductConversation["messages"]): ProductConversation {
  return { sessionId, messages };
}

function turn(key: string): ProductConversation["messages"] {
  return [
    {
      id: `user-${key}`,
      sessionId,
      role: "user",
      content: `question ${key}`,
      metadata: { kind: "memory_chat_turn", idempotencyKey: key },
    },
    {
      id: `assistant-${key}`,
      sessionId,
      role: "assistant",
      content: `answer ${key}`,
      metadata: { kind: "memory_chat_turn", idempotencyKey: key },
    },
  ];
}

const serverPhoto = { photoAssetId: "asset-server-confirmed" };

test("a confirmed first TA photo exposes the free initial preview before any chat", () => {
  const state = resolveMobileVideoOpportunities(serverPhoto, conversation([]), true);
  assert.equal(state.completedRounds, 0);
  assert.deepEqual(state.initialPreview, {
    intent: "initial_preview",
    visible: true,
    saveAllowed: false,
  });
  assert.equal(state.additionalGeneration, null);
});

test("a local blob or a later TA cannot unlock the first preview", () => {
  assert.equal(
    resolveMobileVideoOpportunities({ photoAssetId: null }, conversation([]), true).initialPreview,
    null,
  );
  assert.equal(
    resolveMobileVideoOpportunities(serverPhoto, conversation([]), false).initialPreview,
    null,
  );
});

test("additional generation remains hidden after zero or one persisted round", () => {
  assert.equal(resolveMobileVideoOpportunities(serverPhoto, conversation([]), true).additionalGeneration, null);
  assert.equal(
    resolveMobileVideoOpportunities(serverPhoto, conversation(turn("one")), true).additionalGeneration,
    null,
  );
});

test("two complete persisted active-session rounds unlock only the additional entry", () => {
  const state = resolveMobileVideoOpportunities(serverPhoto, conversation([...turn("one"), ...turn("two")]), true);
  assert.equal(state.completedRounds, 2);
  assert.deepEqual(state.additionalGeneration, {
    intent: "additional_generation",
    visible: true,
    saveAllowed: false,
  });
});

test("refresh and cold restart derive the same opportunities from the formal server snapshot", () => {
  const restored = conversation([...turn("one"), ...turn("two")]);
  const refreshed = resolveMobileVideoOpportunities(serverPhoto, restored, true);
  const coldRestarted = resolveMobileVideoOpportunities(
    serverPhoto,
    JSON.parse(JSON.stringify(restored)) as ProductConversation,
    true,
  );
  assert.deepEqual(coldRestarted, refreshed);
});

test("optimistic, preview, failed, or foreign-session messages cannot manufacture completed rounds", () => {
  const state = resolveMobileVideoOpportunities(serverPhoto, conversation([
    { id: "optimistic-user", sessionId, role: "user", content: "draft", metadata: null },
    { id: "preview", sessionId, role: "assistant", content: "preview", metadata: { kind: "preview_greeting", idempotencyKey: "preview" } },
    { id: "failed", sessionId, role: "assistant", content: "failed", metadata: { kind: "memory_chat_turn", idempotencyKey: "missing-user" } },
    ...turn("one"),
    { ...turn("two")[1], sessionId: "other-session" },
  ]), true);
  assert.equal(state.completedRounds, 1);
  assert.equal(state.additionalGeneration, null);
});

test("a first preview remains unsaveable even if a malformed safe DTO says otherwise", () => {
  const malformedInitial: FirstPresenceVideoSafeDto = {
    id: "job-1",
    memoryId: "memory-1",
    intent: "initial_preview",
    status: "succeeded",
    provider: "vidu-cn-q2-pro-fast",
    saveAllowed: true,
    artifactAvailable: true,
    manualReviewRequired: false,
    errorCode: null,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  };
  assert.equal(saveAllowedForMobileVideo(malformedInitial), false);
});

test("the mobile opportunity shell reuses the Core gate and has no release-only environment markers", () => {
  const opportunity = readFileSync(new URL("./video-opportunity.ts", import.meta.url), "utf8");
  const screen = readFileSync(new URL("./VideoOpportunityScreen.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  assert.match(opportunity, /completedConversationRounds/);
  assert.doesNotMatch(opportunity, /messages\.length/);
  assert.match(api, /\/api\/memories\/\$\{encodeURIComponent\(memoryId\)\}\/first-presence-video/);
  assert.match(api, /loadCommerceCreditBalance\(mobileApiFetch\)/);
  assert.match(api, /credentials: "include"/);
  assert.doesNotMatch(api, /first-presence-video[\s\S]{0,180}method: "POST"/);
  assert.match(app, /confirmedMemory\.photoAssetId/);
  assert.match(app, /setConversation\(await productApi\.getConversation\(memory\.id\)\)/);
  assert.doesNotMatch(screen, /app\.staging|api\.staging|VITE_MOBILE|test_callback|previewGreeting/i);
  assert.doesNotMatch(screen, /createCommerceVideoOrder|\/api\/commerce\/orders|saveSignedVideo/);
});
