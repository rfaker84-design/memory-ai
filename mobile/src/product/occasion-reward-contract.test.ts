import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const screen = readFileSync(new URL("./VideoOpportunityScreen.tsx", import.meta.url), "utf8");

test("mobile occasion rewards retain distinct claim and video recovery keys", () => {
  assert.match(screen, /loadOpenOccasionRewardOffers\(mobileApiFetch\)/);
  assert.match(screen, /readOccasionVideoRecovery\(\)[\s\S]*?createOccasionVideoRecovery\(memory\.id, offer\.occasion\)/);
  assert.match(screen, /claimOccasionReward\(offer\.occasion, recovery\.claimIdempotencyKey, mobileApiFetch\)/);
  assert.match(screen, /createOccasionVideo\(memory\.id, recovery\.videoIdempotencyKey, mobileApiFetch\)/);
  assert.match(screen, /clearOccasionVideoRecovery\(\)/);
});
