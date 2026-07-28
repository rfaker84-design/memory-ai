import assert from "node:assert/strict";
import test from "node:test";

import {
  getStagingRuntimeConfiguration,
  hasValidStagingAccessToken,
  STAGING_APP_ORIGIN,
  StagingRuntimeConfigurationError,
} from "./staging-contract";

const stagingEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "staging",
  DATABASE_URL: "postgresql://staging:secret@127.0.0.1:5432/memoryai_staging",
  STAGING_DATABASE_ISOLATION: "isolated",
  STAGING_DATABASE_NAME: "memoryai_staging",
  STAGING_DATA_SOURCE: "empty",
  AUTH_ALLOWED_ORIGIN: STAGING_APP_ORIGIN,
  STAGING_ACCESS_TOKEN: "a".repeat(48),
  STAGING_FIXED_SMS_CODE: "246810",
  STAGING_FIXED_SMS_PHONES: "+8613800013800,+8613900013900",
  STAGING_MEDIA_ROOT: "/var/lib/memoryai-staging/media",
  STAGING_MEDIA_SIGNING_SECRET: "m".repeat(32),
  LLM_PROVIDER: "mock",
  TTS_PROVIDER: "mock",
};

test("staging runtime requires an isolated database, exact App origin, fixed test capability, and strong token", () => {
  const configuration = getStagingRuntimeConfiguration(stagingEnvironment);
  assert.equal(configuration.databaseName, "memoryai_staging");
  assert.deepEqual(configuration.fixedSmsPhones, ["+8613800013800", "+8613900013900"]);
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
