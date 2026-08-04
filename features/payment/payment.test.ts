import assert from "node:assert/strict";
import { createCipheriv, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import test from "node:test";

import { NextRequest } from "next/server";

import { createPaymentOrdersHandler } from "@/app/api/payments/orders/_handler";
import { createWeChatPayCallbackHandler } from "@/app/api/payments/wechat/callback/_handler";

import { PaymentConfigurationError, PaymentValidationError } from "./errors";
import { loadMemoryExperienceProduct } from "./payment-product";
import { PaymentService } from "./payment-service";
import { WeChatPayH5Provider, loadWeChatPayConfig } from "./wechat-pay-provider";
import type { PaymentDataSource } from "./payment-datasource";
import type { PaymentCallback, PaymentOrder, RefundRequest } from "./types";

process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
process.env.AUTH_TRUST_NGINX_PROXY = "true";
process.env.AUTH_PROXY_LOOPBACK_ONLY = "true";

const memoryId = "00000000-0000-4000-8000-000000000011";
const user = { userId: "00000000-0000-4000-8000-000000000001", externalUserId: "phone:owner", expiresAt: "2026-08-01T00:00:00.000Z" };
const product = { id: "yijian-ta-experience-v1", priceFen: 29900, durationDays: 30, chatQuota: 100 };
const order: PaymentOrder = {
  id: "00000000-0000-4000-8000-000000000012", memoryId, orderNo: "YM20260723010101ABCDEF012345",
  productId: product.id, amountFen: product.priceFen, currency: "CNY", durationDays: 30,
  chatQuota: 100, status: "pending", paymentUrl: null, expiresAt: "2026-07-23T01:16:01.000Z",
  paidAt: null, refundedAt: null, createdAt: "2026-07-23T01:01:01.000Z",
};

test("payment product is explicit and fails closed until price, duration, and quota are configured", () => {
  assert.throws(() => loadMemoryExperienceProduct({} as NodeJS.ProcessEnv), PaymentConfigurationError);
  assert.deepEqual(loadMemoryExperienceProduct({
    YIJIAN_EXPERIENCE_PRODUCT_ID: product.id,
    YIJIAN_EXPERIENCE_PRICE_FEN: "29900",
    YIJIAN_EXPERIENCE_DURATION_DAYS: "30",
    YIJIAN_EXPERIENCE_CHAT_QUOTA: "100",
  } as unknown as NodeJS.ProcessEnv), product);
});

test("checkout failure marks the pending order failed and never invents a payment URL", async () => {
  const events: string[] = [];
  const source: PaymentDataSource = {
    createOrder: async () => order,
    attachCheckout: async () => { throw new Error("should not attach"); },
    markCheckoutFailure: async () => { events.push("failed"); },
    listOrders: async () => [], listEntitlements: async () => [], applyCallback: async () => { throw new Error("unused"); },
    createRefundRequest: async () => { throw new Error("unused"); }, listRefundRequests: async () => [],
    markRefundRequested: async () => { throw new Error("unused"); }, markRefundManualReview: async () => { throw new Error("unused"); },
    beginManualRefundApproval: async () => { throw new Error("unused"); }, rejectManualRefund: async () => { throw new Error("unused"); },
    reserveChatQuota: async () => "free", releaseChatQuota: async () => undefined,
  };
  const service = new PaymentService({ ...source } as never);
  await assert.rejects(service.createCheckout({
    externalUserId: user.externalUserId, memoryId, requestKey: "payment-key-00001", product,
    clientIp: "127.0.0.1", provider: { createH5Checkout: async () => { throw new Error("provider unavailable"); } },
  }));
  assert.deepEqual(events, ["failed"]);
});

test("only a server-qualified unused purchase invokes WeChat; provider failures use a distinct review code", async () => {
  const automatic: RefundRequest = {
    id: "00000000-0000-4000-8000-000000000014", memoryId, orderNo: order.orderNo, amountFen: order.amountFen,
    merchantRefundNo: "YR20260723010101ABCDEF012345", status: "processing", eligibility: "eligible",
    reason: "unused_purchase", decisionCode: null, providerRefundId: null,
    createdAt: "2026-07-23T01:02:01.000Z", requestedAt: null, resolvedAt: null,
  };
  let state = automatic;
  const events: string[] = [];
  const source: PaymentDataSource = {
    createOrder: async () => order, attachCheckout: async () => order, markCheckoutFailure: async () => undefined,
    listOrders: async () => [], listEntitlements: async () => [], applyCallback: async () => { throw new Error("unused"); },
    createRefundRequest: async () => state, listRefundRequests: async () => [],
    markRefundRequested: async (merchantRefundNo, result) => {
      events.push(`requested:${merchantRefundNo}:${result.providerRefundId}`);
      state = { ...state, status: "requested", providerRefundId: result.providerRefundId, requestedAt: "2026-07-23T01:02:02.000Z" };
      return state;
    },
    markRefundManualReview: async (_merchantRefundNo, code) => {
      events.push(`manual:${code}`);
      state = { ...state, status: "manual_review", eligibility: "manual_review", decisionCode: code };
      return state;
    },
    beginManualRefundApproval: async () => ({ refund: state, shouldCallProvider: false }),
    rejectManualRefund: async () => state,
    reserveChatQuota: async () => "free", releaseChatQuota: async () => undefined,
  };
  const service = new PaymentService(new (await import("./payment-repository")).PaymentRepository(source));
  await service.createRefundRequest({
    externalUserId: user.externalUserId, memoryId, orderNo: order.orderNo, reason: "unused_purchase", requestKey: "refund-key-000001",
    provider: { createRefund: async ({ refund: requested }) => { events.push(`provider:${requested.merchantRefundNo}`); return { providerRefundId: "refund-1" }; } },
  });
  state = { ...state, status: "manual_review", eligibility: "manual_review", decisionCode: "REQUESTED_DUPLICATE_CHARGE" };
  await service.createRefundRequest({
    externalUserId: user.externalUserId, memoryId, orderNo: order.orderNo, reason: "duplicate_charge", requestKey: "refund-key-000001",
    provider: { createRefund: async () => { throw new Error("must not call"); } },
  });
  state = automatic;
  await service.createRefundRequest({
    externalUserId: user.externalUserId, memoryId, orderNo: order.orderNo, reason: "unused_purchase", requestKey: "refund-key-000001",
    provider: { createRefund: async () => { throw new Error("provider unavailable"); } },
  });
  assert.deepEqual(events, [
    `provider:${automatic.merchantRefundNo}`,
    `requested:${automatic.merchantRefundNo}:refund-1`,
    "manual:WECHAT_REFUND_CALL_FAILED",
  ]);
});

test("orders API uses only session owner, an idempotency key, and a memory id", async () => {
  const calls: unknown[] = [];
  const handler = createPaymentOrdersHandler(
    () => ({
      createCheckout: async (input) => { calls.push(input); return { ...order, paymentUrl: "https://pay.example.test/h5" }; },
      listOrders: async () => [order],
    }),
    async () => user,
    () => ({ assertConfigured: () => undefined, createH5Checkout: async () => ({ prepayId: null, paymentUrl: "https://pay.example.test/h5" }) }),
    () => product,
    () => true,
    async () => true,
  );
  const response = await handler.POST(new NextRequest("https://memoryai.test/api/payments/orders", {
    method: "POST", headers: {
      origin: "https://memoryai.test", "x-real-ip": "127.0.0.1", "content-type": "application/json", "idempotency-key": "payment-key-00001",
    }, body: JSON.stringify({ memoryId }),
  }));
  assert.equal(response.status, 201);
  assert.equal(calls.length, 1);
  assert.deepEqual(await response.json(), { order: { ...order, paymentUrl: "https://pay.example.test/h5" } });
  const bad = await handler.POST(new NextRequest("https://memoryai.test/api/payments/orders", {
    method: "POST", headers: { origin: "https://memoryai.test", "x-real-ip": "127.0.0.1", "content-type": "application/json", "idempotency-key": "payment-key-00001" },
    body: JSON.stringify({ memoryId, amountFen: 1 }),
  }));
  assert.equal(bad.status, 400);
});

test("legacy checkout rejects a direct request without TA-bound commercial consent", async () => {
  let createCalls = 0;
  const handler = createPaymentOrdersHandler(
    () => ({
      async createCheckout() { createCalls += 1; throw new Error("must not create checkout"); },
      async listOrders() { return []; },
    }),
    async () => user,
    () => ({ assertConfigured: () => undefined, createH5Checkout: async () => ({ prepayId: null, paymentUrl: "https://pay.example.test/h5" }) }),
    () => product,
    () => true,
    async () => false,
  );
  const response = await handler.POST(new NextRequest("https://memoryai.test/api/payments/orders", {
    method: "POST",
    headers: { origin: "https://memoryai.test", "x-real-ip": "127.0.0.1", "content-type": "application/json", "idempotency-key": "payment-consent-required-0001" },
    body: JSON.stringify({ memoryId }),
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "COMMERCIAL_CONSENT_REQUIRED" });
  assert.equal(createCalls, 0);
});

test("signed WeChat callback is delegated once and duplicate success still acknowledges WeChat", async () => {
  const callback: PaymentCallback = {
    eventId: "event-1", kind: "transaction", orderNo: order.orderNo, transactionId: "transaction-1",
    status: "success", amountFen: order.amountFen, payloadHash: "a".repeat(64),
  };
  let calls = 0;
  const handler = createWeChatPayCallbackHandler(
    () => ({ applyCallback: async () => { calls += 1; return { outcome: "duplicate", externalUserId: user.externalUserId, memoryId, orderNo: order.orderNo }; } }),
    () => ({ verifyAndParseCallback: () => callback }),
  );
  const response = await handler(new NextRequest("https://memoryai.test/api/payments/wechat/callback", { method: "POST", body: "{}" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { code: "SUCCESS", message: "成功" });
  assert.equal(calls, 1);
});

test("an unverified WeChat refund callback cannot settle an order or revoke an entitlement", async () => {
  let settlements = 0;
  const handler = createWeChatPayCallbackHandler(
    () => ({ applyCallback: async () => { settlements += 1; return { outcome: "refunded" as const, externalUserId: user.externalUserId, memoryId, orderNo: order.orderNo }; } }),
    () => ({ verifyAndParseCallback: () => { throw new PaymentValidationError("invalid callback signature"); } }),
  );
  const response = await handler(new NextRequest("https://memoryai.test/api/payments/wechat/callback", { method: "POST", body: "{}" }));
  assert.equal(response.status, 401);
  assert.equal(settlements, 0);
});

test("WeChat H5 provider signs checkout calls and verifies encrypted callback evidence", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const merchantPrivateKey = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const platformCertificate = publicKey.export({ type: "spki", format: "pem" }).toString();
  const apiV3Key = Buffer.from("01234567890123456789012345678901");
  const now = new Date("2026-07-23T01:01:01.000Z");
  const provider = new WeChatPayH5Provider({
    loadConfig: () => ({ appId: "wx123", merchantId: "123456", merchantSerialNo: "AABBCCDD", platformSerialNo: "EEFF0011", merchantPrivateKey, platformCertificate, apiV3Key, notifyUrl: "https://yijianmemory.cn/api/payments/wechat/callback" }),
    now: () => now,
    fetch: async (input, init) => {
      assert.equal(String(input), "https://api.mch.weixin.qq.com/v3/pay/transactions/h5");
      assert.match(new Headers(init?.headers).get("authorization") ?? "", /^WECHATPAY2-SHA256-RSA2048 /);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.out_trade_no, order.orderNo);
      return Response.json({ h5_url: "https://wx.tenpay.com/h5", prepay_id: "prepay-1" });
    },
  });
  assert.deepEqual(await provider.createH5Checkout({ order, clientIp: "127.0.0.1" }), { paymentUrl: "https://wx.tenpay.com/h5", prepayId: "prepay-1" });

  const plaintext = JSON.stringify({ appid: "wx123", mchid: "123456", out_trade_no: order.orderNo, transaction_id: "transaction-1", trade_state: "SUCCESS", amount: { total: order.amountFen } });
  const nonce = "0123456789ab";
  const associatedData = "transaction";
  const cipher = createCipheriv("aes-256-gcm", apiV3Key, Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64");
  const rawBody = JSON.stringify({ id: "event-1", resource: { algorithm: "AEAD_AES_256_GCM", ciphertext: encrypted, nonce, associated_data: associatedData } });
  const timestamp = Math.floor(now.getTime() / 1000).toString();
  const callbackNonce = randomBytes(8).toString("hex");
  const signer = createSign("RSA-SHA256");
  signer.update(`${timestamp}\n${callbackNonce}\n${rawBody}\n`); signer.end();
  const headers = new Headers({ "wechatpay-timestamp": timestamp, "wechatpay-nonce": callbackNonce, "wechatpay-serial": "EEFF0011", "wechatpay-signature": signer.sign(merchantPrivateKey, "base64") });
  assert.deepEqual(provider.verifyAndParseCallback(headers, rawBody), {
    eventId: "event-1", kind: "transaction", orderNo: order.orderNo, transactionId: "transaction-1",
    status: "success", amountFen: order.amountFen,
    payloadHash: (await import("node:crypto")).createHash("sha256").update(rawBody).digest("hex"),
  });
});

test("WeChat provider sends a full refund with the stable server-issued refund number", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const merchantPrivateKey = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const platformCertificate = publicKey.export({ type: "spki", format: "pem" }).toString();
  const refund: RefundRequest = {
    id: "00000000-0000-4000-8000-000000000014", memoryId, orderNo: order.orderNo, amountFen: order.amountFen,
    merchantRefundNo: "YR20260723010101ABCDEF012345", status: "processing", eligibility: "eligible",
    reason: "unused_purchase", decisionCode: null, providerRefundId: null,
    createdAt: "2026-07-23T01:02:01.000Z", requestedAt: null, resolvedAt: null,
  };
  const provider = new WeChatPayH5Provider({
    loadConfig: () => ({ appId: "wx123", merchantId: "123456", merchantSerialNo: "AABBCCDD", platformSerialNo: "EEFF0011", merchantPrivateKey, platformCertificate, apiV3Key: Buffer.from("01234567890123456789012345678901"), notifyUrl: "https://yijianmemory.cn/api/payments/wechat/callback" }),
    fetch: async (input, init) => {
      assert.equal(String(input), "https://api.mch.weixin.qq.com/v3/refund/domestic/refunds");
      assert.match(new Headers(init?.headers).get("authorization") ?? "", /^WECHATPAY2-SHA256-RSA2048 /);
      assert.deepEqual(JSON.parse(String(init?.body)), {
        out_trade_no: refund.orderNo, out_refund_no: refund.merchantRefundNo, reason: "Yijian refund",
        notify_url: "https://yijianmemory.cn/api/payments/wechat/callback",
        amount: { refund: refund.amountFen, total: refund.amountFen, currency: "CNY" },
      });
      return Response.json({ refund_id: "wechat-refund-1" });
    },
  });
  assert.deepEqual(await provider.createRefund({ refund }), { providerRefundId: "wechat-refund-1" });
});

test("WeChat configuration never accepts partial merchant credentials", () => {
  assert.throws(() => loadWeChatPayConfig({ WECHAT_PAY_MCH_ID: "123" } as unknown as NodeJS.ProcessEnv), PaymentConfigurationError);
});

test("WeChat callback configuration is bound to the approved application origin and exact callback path", () => {
  const pem = Buffer.from("-----BEGIN TEST KEY-----\nvalue\n-----END TEST KEY-----").toString("base64");
  const base = {
    AUTH_ALLOWED_ORIGIN: "https://app.memoryai.test",
    WECHAT_PAY_NOTIFY_URL: "https://app.memoryai.test/api/payments/wechat/callback",
    WECHAT_PAY_API_V3_KEY: "01234567890123456789012345678901",
    WECHAT_PAY_APP_ID: "wx123",
    WECHAT_PAY_MCH_ID: "123456",
    WECHAT_PAY_MERCHANT_SERIAL_NO: "AABBCCDD",
    WECHAT_PAY_MERCHANT_PRIVATE_KEY_PEM_BASE64: pem,
    WECHAT_PAY_PLATFORM_SERIAL_NO: "EEFF0011",
    WECHAT_PAY_PLATFORM_CERTIFICATE_PEM_BASE64: pem,
  } as unknown as NodeJS.ProcessEnv;
  assert.equal(loadWeChatPayConfig(base).notifyUrl, "https://app.memoryai.test/api/payments/wechat/callback");
  for (const notifyUrl of [
    "https://other.example.test/api/payments/wechat/callback",
    "https://app.memoryai.test/api/payments/wechat/other",
    "https://app.memoryai.test/api/payments/wechat/callback?redirect=elsewhere",
  ]) {
    assert.throws(
      () => loadWeChatPayConfig({ ...base, WECHAT_PAY_NOTIFY_URL: notifyUrl }),
      (error: unknown) => error instanceof PaymentConfigurationError && error.code === "WECHAT_PAY_NOT_CONFIGURED",
    );
  }
});
