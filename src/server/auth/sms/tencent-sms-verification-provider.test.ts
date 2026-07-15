import assert from "node:assert/strict";
import test from "node:test";

import { SmsProviderError } from "./sms-verification-provider";
import { TencentSmsVerificationProvider } from "./tencent-sms-verification-provider";

const config = {
  secretId: "test-secret-id",
  secretKey: "test-secret-key",
  region: "ap-guangzhou",
  sdkAppId: "1400000000",
  signName: "MemoryAI",
  templateId: "100000",
};

test("Tencent provider initializes only on first runtime send", async () => {
  let configLoads = 0;
  let clientCreates = 0;
  const requests: unknown[] = [];
  const provider = new TencentSmsVerificationProvider({
    loadConfig: () => {
      configLoads += 1;
      return config;
    },
    createClient: () => {
      clientCreates += 1;
      return {
        SendSms: async (request) => {
          requests.push(request);
          return { RequestId: "request-1", SendStatusSet: [{ Code: "Ok" }] };
        },
      };
    },
  });

  assert.equal(configLoads, 0);
  assert.equal(clientCreates, 0);
  const result = await provider.sendVerificationCode({
    phoneE164: "+8613800000000",
    code: "123456",
    expiresInMinutes: 5,
  });

  assert.equal(configLoads, 1);
  assert.equal(clientCreates, 1);
  assert.deepEqual(requests, [{
    PhoneNumberSet: ["+8613800000000"],
    SmsSdkAppId: config.sdkAppId,
    SignName: config.signName,
    TemplateId: config.templateId,
    TemplateParamSet: ["123456", "5"],
  }]);
  assert.deepEqual(result, { providerRequestId: "request-1" });
});

test("Tencent provider maps SDK and send status failures to controlled codes", async (t) => {
  await t.test("provider rate limit", async () => {
    const provider = new TencentSmsVerificationProvider({
      loadConfig: () => config,
      createClient: () => ({
        SendSms: async () => ({ SendStatusSet: [{ Code: "LimitExceeded.PhoneNumberDailyLimit" }] }),
      }),
    });
    await assert.rejects(
      provider.sendVerificationCode({ phoneE164: "+8613800000000", code: "123456", expiresInMinutes: 5 }),
      (error: unknown) => error instanceof SmsProviderError && error.code === "SMS_RATE_LIMITED",
    );
  });

  await t.test("SDK unavailable", async () => {
    const provider = new TencentSmsVerificationProvider({
      loadConfig: () => config,
      createClient: () => ({
        SendSms: async () => { throw Object.assign(new Error("private detail"), { code: "InternalError" }); },
      }),
    });
    await assert.rejects(
      provider.sendVerificationCode({ phoneE164: "+8613800000000", code: "123456", expiresInMinutes: 5 }),
      (error: unknown) => error instanceof SmsProviderError && error.code === "SMS_UNAVAILABLE" && !error.message.includes("private detail"),
    );
  });
});
