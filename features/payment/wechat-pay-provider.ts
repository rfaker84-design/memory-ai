import { createDecipheriv, createHash, createSign, createVerify, randomBytes } from "node:crypto";

import { PaymentConfigurationError, PaymentValidationError } from "./errors";
import type { CheckoutProvider, RefundProvider } from "./payment-service";
import type { PaymentCallback, PaymentOrder, RefundRequest, WeChatCheckout, WeChatRefund } from "./types";

type WeChatPayConfig = {
  appId: string;
  merchantId: string;
  merchantSerialNo: string;
  merchantPrivateKey: string;
  apiV3Key: Buffer;
  platformCertificate: string;
  platformSerialNo: string;
  notifyUrl: string;
};
type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type WeChatPayDependencies = { loadConfig?: () => WeChatPayConfig; fetch?: FetchPort; now?: () => Date };
type CallbackEnvelope = {
  id?: unknown;
  resource?: { algorithm?: unknown; ciphertext?: unknown; nonce?: unknown; associated_data?: unknown };
};

function value(environment: NodeJS.ProcessEnv, name: string): string {
  const raw = environment[name];
  const trimmed = raw?.trim();
  if (!trimmed || raw !== trimmed) throw new PaymentConfigurationError("WECHAT_PAY_NOT_CONFIGURED");
  return trimmed;
}

function pem(environment: NodeJS.ProcessEnv, name: string): string {
  try {
    const decoded = Buffer.from(value(environment, name), "base64").toString("utf8");
    if (!decoded.includes("-----BEGIN") || !decoded.includes("-----END")) throw new Error("invalid pem");
    return decoded;
  } catch {
    throw new PaymentConfigurationError("WECHAT_PAY_NOT_CONFIGURED");
  }
}

export function loadWeChatPayConfig(environment: NodeJS.ProcessEnv = process.env): WeChatPayConfig {
  const notifyUrl = value(environment, "WECHAT_PAY_NOTIFY_URL");
  try {
    const parsed = new URL(notifyUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("unsafe notify url");
  } catch {
    throw new PaymentConfigurationError("WECHAT_PAY_NOT_CONFIGURED");
  }
  const apiV3Key = Buffer.from(value(environment, "WECHAT_PAY_API_V3_KEY"), "utf8");
  if (apiV3Key.length !== 32) throw new PaymentConfigurationError("WECHAT_PAY_NOT_CONFIGURED");
  const appId = value(environment, "WECHAT_PAY_APP_ID");
  const merchantId = value(environment, "WECHAT_PAY_MCH_ID");
  const merchantSerialNo = value(environment, "WECHAT_PAY_MERCHANT_SERIAL_NO");
  const platformSerialNo = value(environment, "WECHAT_PAY_PLATFORM_SERIAL_NO");
  if (!/^\w{1,64}$/.test(appId) || !/^\d{1,32}$/.test(merchantId) || !/^[A-Fa-f0-9]{8,64}$/.test(merchantSerialNo) || !/^[A-Fa-f0-9]{8,64}$/.test(platformSerialNo)) {
    throw new PaymentConfigurationError("WECHAT_PAY_NOT_CONFIGURED");
  }
  return {
    appId, merchantId, merchantSerialNo, platformSerialNo, notifyUrl, apiV3Key,
    merchantPrivateKey: pem(environment, "WECHAT_PAY_MERCHANT_PRIVATE_KEY_PEM_BASE64"),
    platformCertificate: pem(environment, "WECHAT_PAY_PLATFORM_CERTIFICATE_PEM_BASE64"),
  };
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new PaymentValidationError(`${field} is invalid`);
  return value;
}

function integerField(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new PaymentValidationError(`${field} is invalid`);
  return value as number;
}

function callbackStatus(value: unknown): PaymentCallback["status"] {
  if (value === "SUCCESS") return "success";
  if (value === "CLOSED") return "cancelled";
  if (value === "REFUND") return "refunded";
  return "failed";
}

export class WeChatPayH5Provider implements CheckoutProvider, RefundProvider {
  private readonly loadConfig: () => WeChatPayConfig;
  private readonly fetchPort: FetchPort;
  private readonly now: () => Date;
  private config?: WeChatPayConfig;

  constructor(dependencies: WeChatPayDependencies = {}) {
    this.loadConfig = dependencies.loadConfig ?? loadWeChatPayConfig;
    this.fetchPort = dependencies.fetch ?? fetch;
    this.now = dependencies.now ?? (() => new Date());
  }

  assertConfigured(): void { this.config ??= this.loadConfig(); }

  private runtime(): WeChatPayConfig {
    this.assertConfigured();
    if (!this.config) throw new PaymentConfigurationError("WECHAT_PAY_NOT_CONFIGURED");
    return this.config;
  }

  private authorization(config: WeChatPayConfig, method: string, path: string, body: string): string {
    const timestamp = Math.floor(this.now().getTime() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");
    const canonical = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
    const signer = createSign("RSA-SHA256");
    signer.update(canonical);
    signer.end();
    const signature = signer.sign(config.merchantPrivateKey, "base64");
    return `WECHATPAY2-SHA256-RSA2048 mchid=\"${config.merchantId}\",nonce_str=\"${nonce}\",timestamp=\"${timestamp}\",serial_no=\"${config.merchantSerialNo}\",signature=\"${signature}\"`;
  }

  async createH5Checkout(input: { order: PaymentOrder; clientIp: string }): Promise<WeChatCheckout> {
    const config = this.runtime();
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(input.clientIp) && !/^[0-9a-f:]+$/i.test(input.clientIp)) {
      throw new PaymentValidationError("clientIp is invalid");
    }
    const path = "/v3/pay/transactions/h5";
    const body = JSON.stringify({
      appid: config.appId,
      mchid: config.merchantId,
      description: `忆见 ${input.order.productId}`,
      out_trade_no: input.order.orderNo,
      notify_url: config.notifyUrl,
      amount: { total: input.order.amountFen, currency: "CNY" },
      scene_info: { payer_client_ip: input.clientIp, h5_info: { type: "Wap" } },
    });
    let response: Response;
    try {
      response = await this.fetchPort(`https://api.mch.weixin.qq.com${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: this.authorization(config, "POST", path, body), accept: "application/json" },
        body,
      });
    } catch {
      throw new PaymentConfigurationError("WECHAT_PAY_UNAVAILABLE");
    }
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || typeof payload.h5_url !== "string") {
      throw new PaymentConfigurationError("WECHAT_PAY_UNAVAILABLE");
    }
    return { paymentUrl: payload.h5_url, prepayId: typeof payload.prepay_id === "string" ? payload.prepay_id : null };
  }

  async createRefund(input: { refund: RefundRequest }): Promise<WeChatRefund> {
    const config = this.runtime();
    const path = "/v3/refund/domestic/refunds";
    const body = JSON.stringify({
      out_trade_no: input.refund.orderNo,
      out_refund_no: input.refund.merchantRefundNo,
      reason: "Yijian refund",
      notify_url: config.notifyUrl,
      amount: { refund: input.refund.amountFen, total: input.refund.amountFen, currency: "CNY" },
    });
    let response: Response;
    try {
      response = await this.fetchPort(`https://api.mch.weixin.qq.com${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: this.authorization(config, "POST", path, body), accept: "application/json" },
        body,
      });
    } catch {
      throw new PaymentConfigurationError("WECHAT_PAY_UNAVAILABLE");
    }
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new PaymentConfigurationError("WECHAT_PAY_UNAVAILABLE");
    return { providerRefundId: typeof payload.refund_id === "string" ? payload.refund_id : null };
  }

  verifyAndParseCallback(headers: Headers, rawBody: string): PaymentCallback {
    const config = this.runtime();
    const timestamp = headers.get("wechatpay-timestamp");
    const nonce = headers.get("wechatpay-nonce");
    const signature = headers.get("wechatpay-signature");
    const serial = headers.get("wechatpay-serial");
    if (!timestamp || !nonce || !signature || !serial || serial !== config.platformSerialNo || !/^\d{10}$/.test(timestamp)) {
      throw new PaymentValidationError("callback signature is invalid");
    }
    if (Math.abs(this.now().getTime() - Number(timestamp) * 1000) > 5 * 60 * 1000) {
      throw new PaymentValidationError("callback timestamp is invalid");
    }
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${timestamp}\n${nonce}\n${rawBody}\n`);
    verifier.end();
    if (!verifier.verify(config.platformCertificate, signature, "base64")) {
      throw new PaymentValidationError("callback signature is invalid");
    }
    let envelope: CallbackEnvelope;
    try { envelope = JSON.parse(rawBody) as CallbackEnvelope; } catch { throw new PaymentValidationError("callback body is invalid"); }
    const eventId = stringField(envelope.id, "event id");
    const resource = envelope.resource;
    if (!resource || resource.algorithm !== "AEAD_AES_256_GCM") throw new PaymentValidationError("callback resource is invalid");
    const ciphertext = stringField(resource.ciphertext, "ciphertext");
    const nonceValue = stringField(resource.nonce, "nonce");
    const associatedData = typeof resource.associated_data === "string" ? resource.associated_data : "";
    let decoded: Record<string, unknown>;
    try {
      const encrypted = Buffer.from(ciphertext, "base64");
      const data = encrypted.subarray(0, -16);
      const tag = encrypted.subarray(-16);
      const decipher = createDecipheriv("aes-256-gcm", config.apiV3Key, Buffer.from(nonceValue, "utf8"));
      decipher.setAuthTag(tag);
      decipher.setAAD(Buffer.from(associatedData, "utf8"));
      decoded = JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")) as Record<string, unknown>;
    } catch {
      throw new PaymentValidationError("callback resource is invalid");
    }
    const amount = decoded.amount as Record<string, unknown> | undefined;
    if (decoded.mchid !== config.merchantId || decoded.appid !== config.appId) {
      throw new PaymentValidationError("callback merchant is invalid");
    }
    const isRefund = typeof decoded.refund_id === "string";
    return {
      eventId,
      kind: isRefund ? "refund" : "transaction",
      orderNo: stringField(decoded.out_trade_no, "order no"),
      ...(isRefund ? {
        refundRequestNo: stringField(decoded.out_refund_no, "refund request no"),
        refundId: stringField(decoded.refund_id, "refund id"),
      } : {}),
      transactionId: stringField(decoded.transaction_id, "transaction id"),
      status: isRefund ? (decoded.refund_status === "SUCCESS" ? "refunded" : "failed") : callbackStatus(decoded.trade_state),
      amountFen: integerField(amount?.total, "amount"),
      payloadHash: createHash("sha256").update(rawBody).digest("hex"),
    };
  }
}

let productionProvider: WeChatPayH5Provider | undefined;
export function getWeChatPayProvider(): WeChatPayH5Provider {
  productionProvider ??= new WeChatPayH5Provider();
  return productionProvider;
}
