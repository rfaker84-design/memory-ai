const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const STAGING_APP_ORIGIN = "https://app.staging.yijianmemory.cn";

/**
 * Creates the complete, isolated production-built staging contract used by
 * runtime tests. It deliberately contains no production capability values.
 */
function createStagingRuntimeTestEnvironment({ mediaRoot, overrides = {} } = {}) {
  const ownsMediaRoot = !mediaRoot;
  const resolvedMediaRoot = mediaRoot ?? mkdtempSync(path.join(os.tmpdir(), "memoryai-staging-media-"));
  let cleaned = false;

  return {
    environment: {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "staging",
      DATABASE_URL: "postgresql://staging:isolated@127.0.0.1:5432/memoryai_staging",
      STAGING_DATABASE_ISOLATION: "isolated",
      STAGING_DATABASE_NAME: "memoryai_staging",
      STAGING_DATA_SOURCE: "empty",
      AUTH_ALLOWED_ORIGIN: STAGING_APP_ORIGIN,
      AUTH_TRUST_NGINX_PROXY: "true",
      AUTH_PROXY_LOOPBACK_ONLY: "true",
      AUTH_VERIFICATION_PEPPER: "p".repeat(32),
      SESSION_SECRET: "s".repeat(32),
      REFUND_REVIEW_ACCESS_TOKEN: "r".repeat(48),
      STAGING_ACCESS_TOKEN: "a".repeat(48),
      STAGING_FIXED_SMS_CODE: "246810",
      STAGING_FIXED_SMS_PHONES: "+8613800013800,+8613900013900",
      STAGING_MEDIA_ROOT: resolvedMediaRoot,
      STAGING_MEDIA_SIGNING_SECRET: "m".repeat(32),
      LLM_PROVIDER: "mock",
      TTS_PROVIDER: "mock",
      ...overrides,
    },
    mediaRoot: resolvedMediaRoot,
    cleanup() {
      if (!ownsMediaRoot || cleaned) return;
      cleaned = true;
      rmSync(resolvedMediaRoot, { recursive: true, force: true });
    },
  };
}

module.exports = { createStagingRuntimeTestEnvironment };
