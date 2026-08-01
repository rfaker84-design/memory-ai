import assert from "node:assert/strict";
import test from "node:test";

import { StagingFixedSmsVerificationProvider } from "./staging-fixed-sms-verification-provider";
import { SmsProviderError } from "./sms-verification-provider";

const environment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "staging",
  DATABASE_URL: "postgresql://staging:secret@127.0.0.1:5432/memoryai_staging",
  STAGING_DATABASE_ISOLATION: "isolated",
  STAGING_DATABASE_NAME: "memoryai_staging",
  STAGING_DATA_SOURCE: "empty",
  AUTH_ALLOWED_ORIGIN: "https://app.staging.yijianmemory.cn",
  STAGING_ACCESS_TOKEN: "a".repeat(48),
  STAGING_FIXED_SMS_CODE: "246810",
  STAGING_FIXED_SMS_PHONES: "+8613800013800,+8613900013900",
  STAGING_MEDIA_ROOT: "/var/lib/memoryai-staging/media",
  STAGING_MEDIA_SIGNING_SECRET: "m".repeat(32),
  LLM_PROVIDER: "mock",
  TTS_PROVIDER: "mock",
};

async function withStagingEnvironment(work: () => Promise<void> | void): Promise<void> {
  const scopedKeys = [...Object.keys(environment), "ACCOUNT_DELETION_ENABLED", "AUTH_SESSION_REVOCATION_ENFORCED", "STAGING_ACCOUNT_DELETION_TEST_PHONE"];
  const previous = new Map(scopedKeys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  try {
    await work();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("fixed staging SMS is limited to two configured synthetic phones and never sends a network request", async () => {
  await withStagingEnvironment(async () => {
    const provider = new StagingFixedSmsVerificationProvider();
    provider.assertConfigured();
    assert.equal(provider.createVerificationCode(), "246810");
    assert.deepEqual(
      await provider.sendVerificationCode({ phoneE164: "+8613800013800", code: "246810", expiresInMinutes: 5 }),
      { providerRequestId: "staging-fixed:3800" },
    );
    await assert.rejects(
      provider.sendVerificationCode({ phoneE164: "+8613700013700", code: "246810", expiresInMinutes: 5 }),
      (error: unknown) => error instanceof SmsProviderError && error.code === "SMS_REJECTED",
    );
  });
});

test("the disposable deletion test identity is accepted only by the explicitly enabled staging deletion runtime", async () => {
  await withStagingEnvironment(async () => {
    Object.assign(process.env, {
      ACCOUNT_DELETION_ENABLED: "true",
      AUTH_SESSION_REVOCATION_ENFORCED: "true",
      STAGING_ACCOUNT_DELETION_TEST_PHONE: "+8613700013700",
    });
    const provider = new StagingFixedSmsVerificationProvider();
    assert.deepEqual(
      await provider.sendVerificationCode({ phoneE164: "+8613700013700", code: "246810", expiresInMinutes: 5 }),
      { providerRequestId: "staging-fixed:3700" },
    );
  });
});
