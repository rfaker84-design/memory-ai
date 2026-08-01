import assert from "node:assert/strict";
import test from "node:test";

import { register } from "@/instrumentation";

import {
  assertProductionAuthConfiguration,
  ProductionAuthConfigurationError,
} from "./production-config";

const productionEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "production",
  DATABASE_URL: "postgresql://memoryai:password@127.0.0.1:5432/memoryai",
  AUTH_VERIFICATION_PEPPER: "p".repeat(32),
  SESSION_SECRET: "s".repeat(32),
  REFUND_REVIEW_ACCESS_TOKEN: "r".repeat(48),
  YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED: "true",
  VIDEO_REVIEW_ACCESS_TOKEN: "review-A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0Uv",
  YIJIAN_VIDEO_REVIEW_ACCOUNT: "video-reviewer@yijian.test",
  YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED: "true",
  VIDEO_RECONCILIATION_ACCESS_TOKEN: "reconcile-Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0Ff",
  YIJIAN_VIDEO_RECONCILIATION_ACCOUNT: "video-reconciler@yijian.test",
  AUTH_ALLOWED_ORIGIN: "https://memoryai.test",
  AUTH_TRUST_NGINX_PROXY: "true",
  AUTH_PROXY_LOOPBACK_ONLY: "true",
  LLM_PROVIDER: "deepseek",
  DEEPSEEK_API_KEY: "test-provider-key",
  DEEPSEEK_MODEL: "deepseek-chat",
  TTS_PROVIDER: "tencent",
  MEDIA_STORAGE_PROVIDER: "cos",
  TENCENT_SECRET_ID: "test-tencent-secret-id",
  TENCENT_SECRET_KEY: "test-tencent-secret-key",
  COS_MEDIA_BUCKET: "memoryai-test-1250000000",
  COS_MEDIA_REGION: "ap-guangzhou",
};

test("production startup accepts core authentication configuration without SMS capability variables", () => {
  assert.doesNotThrow(() => assertProductionAuthConfiguration(productionEnvironment));
});

test("production authentication startup configuration fails closed for every required boundary", () => {
  const cases: Array<[string, string]> = [
    ["DATABASE_URL", "DATABASE_URL_NOT_CONFIGURED"],
    ["AUTH_VERIFICATION_PEPPER", "AUTH_VERIFICATION_PEPPER_NOT_CONFIGURED"],
    ["SESSION_SECRET", "SESSION_SECRET_NOT_CONFIGURED"],
    ["REFUND_REVIEW_ACCESS_TOKEN", "REFUND_REVIEW_ACCESS_TOKEN_NOT_CONFIGURED"],
    ["VIDEO_REVIEW_ACCESS_TOKEN", "VIDEO_REVIEW_ACCESS_TOKEN_NOT_CONFIGURED"],
    ["VIDEO_RECONCILIATION_ACCESS_TOKEN", "VIDEO_RECONCILIATION_ACCESS_TOKEN_NOT_CONFIGURED"],
    ["AUTH_ALLOWED_ORIGIN", "AUTH_ALLOWED_ORIGIN_NOT_CONFIGURED"],
    ["DEPLOYMENT_ENV", "DEPLOYMENT_ENV_INVALID"],
    ["AUTH_TRUST_NGINX_PROXY", "AUTH_TRUST_NGINX_PROXY_NOT_CONFIGURED"],
    ["AUTH_PROXY_LOOPBACK_ONLY", "AUTH_PROXY_LOOPBACK_CONTRACT_NOT_CONFIGURED"],
    ["LLM_PROVIDER", "DEEPSEEK_PROVIDER_REQUIRED"],
    ["DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY_NOT_CONFIGURED"],
    ["DEEPSEEK_MODEL", "DEEPSEEK_MODEL_NOT_CONFIGURED"],
    ["TTS_PROVIDER", "TENCENT_TTS_PROVIDER_REQUIRED"],
    ["TENCENT_SECRET_ID", "TENCENT_SECRET_ID_NOT_CONFIGURED"],
    ["TENCENT_SECRET_KEY", "TENCENT_SECRET_KEY_NOT_CONFIGURED"],
    ["COS_MEDIA_BUCKET", "COS_MEDIA_BUCKET_NOT_CONFIGURED"],
    ["COS_MEDIA_REGION", "COS_MEDIA_REGION_NOT_CONFIGURED"],
  ];

  for (const [name, code] of cases) {
    const environment = { ...productionEnvironment, [name]: "" };
    assert.throws(
      () => assertProductionAuthConfiguration(environment),
      (error: unknown) => error instanceof ProductionAuthConfigurationError && error.code === code,
      name
    );
  }
});

test("production authentication startup configuration rejects weak secrets and unsafe endpoints", () => {
  for (const [name, value, code] of [
    ["AUTH_VERIFICATION_PEPPER", "too-short", "AUTH_VERIFICATION_PEPPER_NOT_CONFIGURED"],
    ["SESSION_SECRET", "too-short", "SESSION_SECRET_NOT_CONFIGURED"],
    ["REFUND_REVIEW_ACCESS_TOKEN", "too-short", "REFUND_REVIEW_ACCESS_TOKEN_NOT_CONFIGURED"],
    ["DATABASE_URL", "mysql://example.test/auth", "DATABASE_URL_INVALID"],
    ["AUTH_ALLOWED_ORIGIN", "http://memoryai.test", "AUTH_ALLOWED_ORIGIN_INVALID"],
    ["TTS_PROVIDER", "mock", "TENCENT_TTS_PROVIDER_REQUIRED"],
    ["MEDIA_STORAGE_PROVIDER", "unsupported", "MEDIA_STORAGE_PROVIDER_INVALID"],
  ] as const) {
    const environment = { ...productionEnvironment, [name]: value };
    assert.throws(
      () => assertProductionAuthConfiguration(environment),
      (error: unknown) => error instanceof ProductionAuthConfigurationError && error.code === code,
      name
    );
  }
});

test("non-production configuration does not prevent local development startup", () => {
  assert.doesNotThrow(() => assertProductionAuthConfiguration({ NODE_ENV: "development" }));
});

test("production rejects every staging-only capability even when its other settings are valid", () => {
  for (const override of [
    { STAGING_ACCESS_TOKEN: "a".repeat(48) },
    { STAGING_FIXED_SMS_CODE: "246810" },
    { STAGING_MEDIA_ROOT: "/var/lib/memoryai-staging/media" },
    { STORAGE_PROVIDER: "local" },
    { MEDIA_STORAGE_PROVIDER: "local" },
  ]) {
    assert.throws(
      () => assertProductionAuthConfiguration({ ...productionEnvironment, ...override }),
      (error: unknown) => error instanceof ProductionAuthConfigurationError
        && error.code === "STAGING_CAPABILITY_FORBIDDEN",
    );
  }
});

test("production startup rejects incomplete or expired session rotation configuration", () => {
  for (const override of [
    { SESSION_SECRET_PREVIOUS: "p".repeat(32) },
    {
      SESSION_SECRET_PREVIOUS: "p".repeat(32),
      SESSION_SECRET_PREVIOUS_KID: "previous-v1",
      SESSION_SECRET_PREVIOUS_VALID_UNTIL: new Date(Date.now() - 1_000).toISOString(),
    },
  ]) {
    assert.throws(
      () => assertProductionAuthConfiguration({ ...productionEnvironment, ...override }),
      (error: unknown) => error instanceof ProductionAuthConfigurationError
        && error.code === "SESSION_SECRET_PREVIOUS_CONFIGURATION_INVALID",
    );
  }
});

test("production instrumentation invokes the startup gate before serving requests", async () => {
  const keys = Object.keys(productionEnvironment);
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const previousPhase = process.env.NEXT_PHASE;
  const previousRuntime = process.env.NEXT_RUNTIME;
  try {
    Object.assign(process.env, productionEnvironment);
    delete process.env.SESSION_SECRET;
    delete process.env.NEXT_PHASE;
    process.env.NEXT_RUNTIME = "nodejs";
    await assert.rejects(
      register(),
      (error: unknown) => error instanceof ProductionAuthConfigurationError
        && error.code === "SESSION_SECRET_NOT_CONFIGURED"
    );
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (previousPhase === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = previousPhase;
    if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = previousRuntime;
  }
});
