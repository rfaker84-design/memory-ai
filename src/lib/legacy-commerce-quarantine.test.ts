import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { completeOrder, createOrder, getRevenueStats, getUserOrders, LEGACY_CHAT_COMMERCE_UNAVAILABLE } from "./payment";
import { calculateEmotionLoad, generateSoftPrompt, getUserCapabilities, setUserTier } from "@/app/lib/commerce-balance";

test("historical payment module cannot create, complete, or read orders", async () => {
  assert.deepEqual(await createOrder("owner", "pro", "monthly"), { success: false, error: LEGACY_CHAT_COMMERCE_UNAVAILABLE });
  assert.deepEqual(await completeOrder("order"), { success: false, error: LEGACY_CHAT_COMMERCE_UNAVAILABLE });
  assert.deepEqual(await getUserOrders("owner"), []);
  assert.deepEqual(await getRevenueStats(), { today: 0, thisMonth: 0, total: 0, orderCount: 0 });
});

test("historical emotion conversion cannot prompt, tier-write, or infer commercial eligibility", async () => {
  assert.equal(generateSoftPrompt({ currentTier: "free", placement: "profile", avatarGenerated: true, voiceTrained: true, memoryCount: 100 }), null);
  assert.equal(calculateEmotionLoad({ recentEmotions: ["lonely"], userMessage: "好想你", chatRoundCount: 99, currentHour: 1 }).canPromptCommerce, false);
  assert.equal(await setUserTier("owner", "premium"), false);
  assert.equal((await getUserCapabilities("owner")).nextTier, null);
});

test("legacy quarantines have no direct Supabase client or emotional conversion copy", () => {
  const payment = readFileSync(new URL("./payment.ts", import.meta.url), "utf8");
  const balance = readFileSync(new URL("../../app/lib/commerce-balance.ts", import.meta.url), "utf8");
  assert.doesNotMatch(payment, /createClient|payment_orders|mock_/);
  assert.doesNotMatch(balance, /createClient|TA越来越真实|主动陪伴|多人格/);
});
