import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const client = read("src/components/product-metrics/productInteractionClient.ts");

test("product metrics client is same-origin fire-and-forget and does not expose content fields", () => {
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /\.catch\(\(\) => undefined\)/);
  assert.doesNotMatch(client, /await fetch|phone_number|chat_message|photo_url|cos_key|birthday/i);
});

test("a confirmed photo upload remains deliverable across the immediate chat navigation", () => {
  assert.match(client, /keepalive: interaction\.eventName === "photo_upload_succeeded"/);
});

test("real success nodes contain non-visual metric calls", () => {
  const home = read("app/page.tsx");
  const creation = read("src/components/first-presence/FirstPresenceFlow.tsx");
  const createMemory = read("src/components/create-memory/CreateMemoryExperience.tsx");
  const encounter = read("app/memory/[id]/encounter/page.tsx");
  const commerce = read("src/components/first-presence/CommerceVideoCreditsEntry.tsx");
  assert.match(home, /guest_experience_started/);
  assert.match(creation, /photo_upload_succeeded/);
  const completion = creation.slice(creation.indexOf("const completeCreatedMemory"), creation.indexOf("const continueRecoveredCreation"));
  assert.match(completion, /await uploadCurrentCreationMedia\([\s\S]*?photo_upload_succeeded[\s\S]*?router\.replace\(`\/memory-chat\//);
  const createMemoryCompletion = createMemory.slice(createMemory.indexOf("const completeCreatedMemory"), createMemory.indexOf("const exitCreateFlow"));
  assert.match(createMemoryCompletion, /await uploadCurrentCreationMedia\([\s\S]*?photo_upload_succeeded[\s\S]*?setCreated\(memory\)/);
  assert.match(encounter, /first_presence_video_played_3s/);
  assert.match(encounter, /playbackWatchedSeconds\.current \+= delta/);
  assert.match(commerce, /view !== "packages"/);
  assert.match(commerce, /paywall_viewed/);
});
