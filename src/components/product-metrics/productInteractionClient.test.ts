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

test("real success nodes contain non-visual metric calls", () => {
  const home = read("app/page.tsx");
  const creation = read("src/components/first-presence/FirstPresenceFlow.tsx");
  const encounter = read("app/memory/[id]/encounter/page.tsx");
  const commerce = read("src/components/first-presence/CommerceVideoCreditsEntry.tsx");
  assert.match(home, /guest_experience_started/);
  assert.match(creation, /photo_upload_succeeded/);
  assert.match(encounter, /first_presence_video_played_3s/);
  assert.match(encounter, /playbackWatchedSeconds\.current \+= delta/);
  assert.match(commerce, /view !== "packages"/);
  assert.match(commerce, /paywall_viewed/);
});
