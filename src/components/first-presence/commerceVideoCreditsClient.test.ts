import assert from "node:assert/strict";
import test from "node:test";

import {
  availableVideoCredits,
  clearCommerceVideoOrderRecovery,
  COMMERCE_VIDEO_ORDER_RECOVERY_STORAGE_KEY,
  commercePlatform,
  createCommerceVideoOrder,
  createReferralCode,
  loadCommerceCreditBalance,
  loadCommerceVideoProducts,
  loadReferralStatus,
  readCommerceVideoOrderRecovery,
  writeCommerceVideoOrderRecovery,
} from "./commerceVideoCreditsClient";
import { listCommerceProducts } from "../../../features/commerce";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("video-credit entry reads only the new Commerce catalog, balance, and referral contracts", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const request = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    if (input === "/api/commerce/catalog") {
      return response({ products: [{ id: "memory_video_49", priceFen: 4900, generationCredits: 2, grantsFirstPreviewSave: true }] });
    }
    if (input === "/api/commerce/credits") {
      return response({ balance: { paidAvailable: 2, referralAvailable: 1, freePreviewAvailable: 0, photoRemedyAvailable: 0, totalAvailable: 3, paidCreditsNeverExpire: true, canSaveFirstPreview: true } });
    }
    if (input === "/api/commerce/referrals/code") {
      return response({ referral: { code: "ABCDEFGH23", qualifiedInvitees: 1, rewardsGranted: 0, inviteesUntilNextReward: 2 } });
    }
    throw new Error("unexpected Commerce endpoint");
  };

  const [products, balance, referral] = await Promise.all([
    loadCommerceVideoProducts(request as typeof fetch),
    loadCommerceCreditBalance(request as typeof fetch),
    loadReferralStatus(request as typeof fetch),
  ]);

  assert.equal(products[0].generationCredits, 2);
  assert.equal(availableVideoCredits(balance), 3);
  assert.equal(referral.inviteesUntilNextReward, 2);
  assert.deepEqual(calls.map(({ input }) => input), [
    "/api/commerce/catalog",
    "/api/commerce/credits",
    "/api/commerce/referrals/code",
  ]);
  assert.ok(calls.every(({ input }) => !String(input).includes("/api/payments/")));
});

test("video-credit entry creates only server-priced Commerce orders and referral codes", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const request = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    if (input === "/api/commerce/referrals/code") return response({ referral: { code: "ABCDEFGH23" } }, 201);
    return response({ order: { orderNo: "YC0001" }, checkout: { kind: "test_callback_required" } }, 201);
  };

  await createReferralCode(request as typeof fetch);
  await createCommerceVideoOrder(
    "00000000-0000-4000-8000-000000000001",
    "memory_video_199",
    "android",
    request as typeof fetch,
  );

  assert.equal(calls[0].input, "/api/commerce/referrals/code");
  assert.equal(calls[0].init?.method, "POST");
  assert.match(String((calls[0].init?.headers as Record<string, string>)["Idempotency-Key"]), /^commerce-referral-/);
  assert.equal(calls[1].input, "/api/commerce/orders");
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
    memoryId: "00000000-0000-4000-8000-000000000001",
    productId: "memory_video_199",
    platform: "android",
  });
  assert.equal((JSON.parse(String(calls[1].init?.body)) as Record<string, unknown>).amountFen, undefined);
});

test("video-credit order recovery only reuses the exact memory, product, platform, and idempotency key", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const recovery = {
    memoryId: "00000000-0000-4000-8000-000000000001",
    productId: "memory_video_49" as const,
    platform: "android" as const,
    idempotencyKey: "commerce-video-order-recovery-key-0001",
  };
  assert.equal(writeCommerceVideoOrderRecovery(recovery, storage), true);
  assert.deepEqual(readCommerceVideoOrderRecovery(storage), recovery);
  let suppliedKey = "";
  await createCommerceVideoOrder(recovery.memoryId, recovery.productId, recovery.platform, (async (_input, init) => {
    suppliedKey = String((init?.headers as Record<string, string>)["Idempotency-Key"]);
    return response({ order: { orderNo: "YC0001" }, checkout: { kind: "test_callback_required" } }, 201);
  }) as typeof fetch, recovery.idempotencyKey);
  assert.equal(suppliedKey, recovery.idempotencyKey);
  values.set(COMMERCE_VIDEO_ORDER_RECOVERY_STORAGE_KEY, JSON.stringify({ ...recovery, platform: "forged" }));
  assert.equal(readCommerceVideoOrderRecovery(storage), null);
  assert.equal(values.has(COMMERCE_VIDEO_ORDER_RECOVERY_STORAGE_KEY), false);
  assert.equal(clearCommerceVideoOrderRecovery(storage), true);
});

test("iOS remains explicitly reserved for StoreKit and other platforms stay distinct", () => {
  assert.equal(commercePlatform("Mozilla/5.0 (iPhone)"), "ios");
  assert.equal(commercePlatform("Mozilla/5.0 (Linux; Android 14)"), "android");
  assert.equal(commercePlatform("Mozilla/5.0 (Windows NT 10.0)"), "web");
});

test("an invalid balance payload is unavailable instead of becoming zero credits", async () => {
  await assert.rejects(
    loadCommerceCreditBalance((async () => response({
      balance: {
        paidAvailable: 0,
        referralAvailable: 0,
        freePreviewAvailable: 0,
        photoRemedyAvailable: 0,
        totalAvailable: "0",
        paidCreditsNeverExpire: true,
        canSaveFirstPreview: false,
      },
    })) as typeof fetch),
    /INVALID_COMMERCE_BALANCE/,
  );
});

test("the visible package labels come from the immutable new Commerce catalog", () => {
  assert.deepEqual(
    listCommerceProducts().map((product) => product.priceFen / 100 + "元 / " + product.generationCredits + "次"),
    ["49元 / 2次", "99元 / 6次", "199元 / 15次"],
  );
});
