import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const environmentTemplate = readFileSync(".env.example", "utf8");

test("external video, payment, and product capabilities are documented as empty fail-closed inputs", () => {
  for (const name of [
    "VIDU_API_KEY",
    "YIJIAN_EXPERIENCE_PRODUCT_ID",
    "YIJIAN_EXPERIENCE_PRICE_FEN",
    "YIJIAN_EXPERIENCE_DURATION_DAYS",
    "YIJIAN_EXPERIENCE_CHAT_QUOTA",
    "WECHAT_PAY_NOTIFY_URL",
    "WECHAT_PAY_API_V3_KEY",
    "WECHAT_PAY_APP_ID",
    "WECHAT_PAY_MCH_ID",
    "WECHAT_PAY_MERCHANT_SERIAL_NO",
    "WECHAT_PAY_MERCHANT_PRIVATE_KEY_PEM_BASE64",
    "WECHAT_PAY_PLATFORM_SERIAL_NO",
    "WECHAT_PAY_PLATFORM_CERTIFICATE_PEM_BASE64",
  ]) assert.match(environmentTemplate, new RegExp(`^${name}=$`, "m"), name);
  assert.match(environmentTemplate, /commercial terms,\n# retention\/deletion terms, region/i);
  assert.match(environmentTemplate, /fail closed until the merchant account/i);
});

test("production mutation kill switches are explicit and default to disabled", () => {
  for (const name of [
    "YIJIAN_REGISTRATION_ENABLED",
    "YIJIAN_VIDEO_GENERATION_ENABLED",
    "YIJIAN_COMMERCE_PURCHASE_ENABLED",
  ]) assert.match(environmentTemplate, new RegExp(`^${name}=false$`, "m"), name);
  assert.match(environmentTemplate, /mutating capability kill switches/i);
});
