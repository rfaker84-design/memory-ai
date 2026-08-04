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

test("mobile referral entry obtains a server code without fabricating qualification or rewards", () => {
  assert.match(screen, /createReferralCode\(mobileApiFetch\)/);
  assert.match(screen, /isMissingReferralCode\(error\)\) return null/);
  assert.match(screen, /邀请代码已由服务端签发；分享本身不会计入资格或发放机会/);
  assert.match(screen, /不同已验证手机号和已验证设备/);
  assert.match(screen, /资格、去重和机会都只由服务端核验/);
  assert.match(screen, /navigator\.clipboard\?\.writeText/);
  assert.match(screen, /没有创建本地资格或奖励/);
});
