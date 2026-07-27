import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { NextRequest } from "next/server";

import { createPaymentOrdersHandler } from "./payments/orders/_handler";
import { createPaymentRefundsHandler } from "./payments/refunds/_handler";
import { isLegacyChatCommerceTestAccount } from "@/features/payment";
import { middleware } from "@/middleware";

const legacyPaths = [
  "/api/payments/orders",
  "/api/payments/refunds",
  "/api/payments/entitlements",
  "/api/payments/wechat/callback",
  "/api/internal/refund-reviews",
] as const;

function restoreEnvironment(name: string, value: string | undefined) {
  const environment = process.env as Record<string, string | undefined>;
  if (value === undefined) delete environment[name];
  else environment[name] = value;
}

test("public production requests cannot reach legacy chat commerce routes", async (t) => {
  const before = {
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.LEGACY_CHAT_COMMERCE_TEST_MODE,
    accounts: process.env.LEGACY_CHAT_COMMERCE_TEST_ACCOUNTS,
  };
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.LEGACY_CHAT_COMMERCE_TEST_MODE = "true";
  process.env.LEGACY_CHAT_COMMERCE_TEST_ACCOUNTS = "phone:internal-test";
  try {
    assert.equal(isLegacyChatCommerceTestAccount("phone:internal-test"), false);
    for (const pathname of legacyPaths) {
      await t.test(pathname, () => {
        const response = middleware(new NextRequest(`https://memoryai.test${pathname}`, {
          method: "POST",
          headers: { origin: "https://memoryai.test" },
        }));
        assert.equal(response.status, 410);
        assert.deepEqual(response.headers.get("cache-control"), "private, no-store, max-age=0");
        return response.json().then((body) => assert.deepEqual(body, { error: "LEGACY_ROUTE_UNAVAILABLE" }));
      });
    }
  } finally {
    restoreEnvironment("NODE_ENV", before.nodeEnv);
    restoreEnvironment("LEGACY_CHAT_COMMERCE_TEST_MODE", before.testMode);
    restoreEnvironment("LEGACY_CHAT_COMMERCE_TEST_ACCOUNTS", before.accounts);
  }
});

test("internal legacy test mode requires the exact flag and exact allowlisted account", () => {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    LEGACY_CHAT_COMMERCE_TEST_MODE: "true",
    LEGACY_CHAT_COMMERCE_TEST_ACCOUNTS: "phone:internal-test",
  };
  assert.equal(isLegacyChatCommerceTestAccount("phone:internal-test", environment), true);
  assert.equal(isLegacyChatCommerceTestAccount("phone:ordinary-user", environment), false);
  assert.equal(isLegacyChatCommerceTestAccount("phone:internal-test", {
    ...environment,
    LEGACY_CHAT_COMMERCE_TEST_MODE: "TRUE",
  }), false);
});

test("legacy APIs require an exact internal account even outside production", async () => {
  const session = async () => ({
    userId: "internal-user",
    externalUserId: "phone:ordinary-user",
    expiresAt: "2026-12-31T00:00:00.000Z",
  });
  const orders = createPaymentOrdersHandler(
    () => ({ createCheckout: async () => { throw new Error("must not create"); }, listOrders: async () => [] }),
    session,
    undefined,
    undefined,
    () => false,
  );
  const refunds = createPaymentRefundsHandler(
    () => ({ createRefundRequest: async () => { throw new Error("must not refund"); }, listRefundRequests: async () => [] }),
    session,
    undefined,
    () => false,
  );
  const request = new NextRequest("https://memoryai.test/api/payments/orders?memoryId=memory-1");
  assert.equal((await orders.GET(request)).status, 404);
  assert.equal((await refunds.GET(new NextRequest("https://memoryai.test/api/payments/refunds?memoryId=memory-1"))).status, 404);
});

test("public client surfaces have no active legacy purchase entry", () => {
  const conversation = readFileSync("src/components/first-presence/MemoryConversationScene.tsx", "utf8");
  const continuity = readFileSync("app/(continuity)/continuity/page.tsx", "utf8");
  const firstPresence = readFileSync("src/components/first-presence/FirstPresenceFlow.tsx", "utf8");
  assert.doesNotMatch(conversation, /MemoryExperienceOffer|\/api\/payments\//);
  assert.doesNotMatch(continuity, /RefundCenter|\/api\/payments\//);
  assert.doesNotMatch(firstPresence, /preview-chat-two|49元|previewOffer/);
  assert.match(firstPresence, /onClick=\{leaveFlow\}/);
});
