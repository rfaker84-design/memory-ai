import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  getStagingRuntimeConfiguration,
  hasValidStagingAccessToken,
  STAGING_APP_ORIGIN,
  StagingRuntimeConfigurationError,
} from "./staging-contract";

const { createStagingRuntimeTestEnvironment } = createRequire(import.meta.url)(
  "../../../scripts/test-support/staging-runtime-test-environment.cjs",
);
const stagingEnvironment: NodeJS.ProcessEnv = createStagingRuntimeTestEnvironment({
  mediaRoot: "/var/lib/memoryai-staging/media",
}).environment;

test("staging runtime requires an isolated database, exact App origin, fixed test capability, and strong token", () => {
  const configuration = getStagingRuntimeConfiguration(stagingEnvironment);
  assert.equal(configuration.databaseName, "memoryai_staging");
  assert.deepEqual(configuration.fixedSmsPhones, ["+8613800013800", "+8613900013900"]);
  assert.equal(configuration.accountDeletionTestPhone, null);
  assert.equal(hasValidStagingAccessToken("a".repeat(48), stagingEnvironment), true);
  assert.equal(hasValidStagingAccessToken("wrong", stagingEnvironment), false);
});

test("staging runtime fails closed for production-shaped database, origin, provider, and fixed-SMS mistakes", () => {
  const invalids: Array<[string, Partial<NodeJS.ProcessEnv>, string]> = [
    ["database isolation", { STAGING_DATABASE_ISOLATION: "shared" }, "STAGING_DATABASE_ISOLATION_INVALID"],
    ["copied data", { STAGING_DATA_SOURCE: "production-copy" }, "STAGING_DATA_SOURCE_INVALID"],
    ["production database name", { STAGING_DATABASE_NAME: "memoryai" }, "STAGING_DATABASE_NAME_INVALID"],
    ["wrong origin", { AUTH_ALLOWED_ORIGIN: "https://yijianmemory.cn" }, "AUTH_ALLOWED_ORIGIN_INVALID"],
    ["third phone", { STAGING_FIXED_SMS_PHONES: "+8613800013800,+8613900013900,+8613700013700" }, "STAGING_FIXED_SMS_PHONES_INVALID"],
    ["real LLM", { LLM_PROVIDER: "deepseek" }, "LLM_PROVIDER_INVALID"],
    ["short access token", { STAGING_ACCESS_TOKEN: "short" }, "STAGING_ACCESS_TOKEN_NOT_CONFIGURED"],
  ];
  for (const [name, override, code] of invalids) {
    assert.throws(
      () => getStagingRuntimeConfiguration({ ...stagingEnvironment, ...override }),
      (error: unknown) => error instanceof StagingRuntimeConfigurationError && error.code === code,
      name,
    );
  }
});

test("a disposable deletion test identity is staging-only, distinct, and requires the revocation-safe deletion runtime", () => {
  const enabled = {
    ...stagingEnvironment,
    ACCOUNT_DELETION_ENABLED: "true",
    AUTH_SESSION_REVOCATION_ENFORCED: "true",
    STAGING_ACCOUNT_DELETION_TEST_PHONE: "+8613700013700",
  };
  assert.equal(getStagingRuntimeConfiguration(enabled).accountDeletionTestPhone, "+8613700013700");
  for (const override of [
    { STAGING_ACCOUNT_DELETION_TEST_PHONE: "+8613800013800" },
    { STAGING_ACCOUNT_DELETION_TEST_PHONE: "+8613700013700" },
  ]) {
    assert.throws(
      () => getStagingRuntimeConfiguration({ ...enabled, ...override, ...(override.STAGING_ACCOUNT_DELETION_TEST_PHONE === "+8613700013700" ? { ACCOUNT_DELETION_ENABLED: "false" } : {}) }),
      (error: unknown) => error instanceof StagingRuntimeConfigurationError && error.code === "STAGING_ACCOUNT_DELETION_TEST_PHONE_INVALID",
    );
  }
});

test("staging media signing rotation permits one short bounded previous key", () => {
  const now = new Date("2026-08-01T00:00:00.000Z");
  const valid = {
    ...stagingEnvironment,
    STAGING_MEDIA_SIGNING_SECRET_PREVIOUS: "p".repeat(32),
    STAGING_MEDIA_SIGNING_SECRET_PREVIOUS_VALID_UNTIL: new Date(now.getTime() + 900_000).toISOString(),
  };
  assert.equal(getStagingRuntimeConfiguration(valid, now).previousMediaSigningSecret, "p".repeat(32));
  for (const override of [
    { STAGING_MEDIA_SIGNING_SECRET_PREVIOUS: "p".repeat(32) },
    {
      STAGING_MEDIA_SIGNING_SECRET_PREVIOUS: "p".repeat(32),
      STAGING_MEDIA_SIGNING_SECRET_PREVIOUS_VALID_UNTIL: new Date(now.getTime() + 901_000).toISOString(),
    },
  ]) {
    assert.throws(
      () => getStagingRuntimeConfiguration({ ...stagingEnvironment, ...override }, now),
      (error: unknown) => error instanceof StagingRuntimeConfigurationError
        && error.code === "STAGING_MEDIA_SIGNING_SECRET_PREVIOUS_INVALID",
    );
  }
});
