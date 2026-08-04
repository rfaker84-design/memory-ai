import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const screen = readFileSync(new URL("./VideoOpportunityScreen.tsx", import.meta.url), "utf8");
const ownerApi = readFileSync(new URL("../../../features/video/first-presence-video-owner-api.ts", import.meta.url), "utf8");

test("mobile occasion rewards retain distinct claim and video recovery keys", () => {
  assert.match(screen, /loadOpenOccasionRewardOffers\(mobileApiFetch\)/);
  assert.match(screen, /readOccasionVideoRecovery\(\)[\s\S]*?createOccasionVideoRecovery\(memory\.id, offer\.occasion\)/);
  assert.match(screen, /claimOccasionReward\(offer\.occasion, recovery\.claimIdempotencyKey, mobileApiFetch\)/);
  assert.match(screen, /createOccasionVideo\(memory\.id, recovery\.videoIdempotencyKey, mobileApiFetch\)/);
  assert.match(screen, /clearOccasionVideoRecovery\(\)/);
});

test("occasion rewards are independent from the two-round paid-video gate and let an owner choose a photographed TA", () => {
  assert.match(ownerApi, /input\.intent === "additional_generation" && input\.creditSource !== "occasion_reward"/);
  assert.match(screen, /!remoteReadable \|\| !hasConfirmedPhoto/);
  assert.match(screen, /领取机会与后续影像资格独立，不要求先完成两轮对话/);
  assert.match(screen, /ownedMemories\.filter\(\(candidate\) => candidate\.photoAssetId\?\.trim\(\)\)\.length > 1/);
  assert.match(screen, /onSelectMemory\(candidate\.id\)/);
});

test("mobile referral entry obtains a server code without fabricating qualification or rewards", () => {
  assert.match(screen, /createReferralCode\(mobileApiFetch\)/);
  assert.match(screen, /isMissingReferralCode\(error\)\) return null/);
  assert.match(screen, /邀请代码已由服务端签发；分享本身不会计入资格或发放机会/);
  assert.match(screen, /不同已验证手机号和已验证设备/);
  assert.match(screen, /资格、去重和机会都只由服务端核验/);
  assert.match(screen, /navigator\.clipboard\?\.writeText/);
  assert.match(screen, /没有创建本地资格或奖励/);
});
