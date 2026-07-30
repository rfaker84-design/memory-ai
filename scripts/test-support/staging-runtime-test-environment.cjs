const { mkdirSync, mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const STAGING_APP_ORIGIN = "https://app.staging.yijianmemory.cn";
const VIDEO_REVIEW_ACCESS_TOKEN = "review-A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0Uv";
const VIDEO_RECONCILIATION_ACCESS_TOKEN = "reconcile-Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0Ff";

/**
 * Creates the complete, isolated production-built staging contract used by
 * runtime tests. It deliberately contains no production capability values.
 */
function createStagingRuntimeTestEnvironment({ mediaRoot, overrides = {} } = {}) {
  const ownsMediaRoot = !mediaRoot;
  const resolvedMediaRoot = mediaRoot ?? mkdtempSync(path.join(os.tmpdir(), "memoryai-staging-media-"));
  const videoSharedRoot = mkdtempSync(path.join(os.tmpdir(), "memoryai-staging-video-"));
  const videoArtifactRoot = path.join(videoSharedRoot, "artifacts");
  const videoEvidenceRoot = path.join(videoSharedRoot, "evidence");
  mkdirSync(videoArtifactRoot);
  mkdirSync(videoEvidenceRoot);
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
      VIDEO_ARTIFACT_STORAGE_PROVIDER: "local-staging",
      VIDEO_STAGING_SHARED_ROOT: videoSharedRoot,
      VIDEO_ARTIFACT_STAGING_ROOT: videoArtifactRoot,
      VIDEO_WORKER_EVIDENCE_ROOT: videoEvidenceRoot,
      VIDEO_ARTIFACT_SIGNING_SECRET: "v".repeat(48),
      VIDEO_ARTIFACT_PLAYBACK_BASE_URL: "https://api.staging.yijianmemory.cn/api/first-presence-video/playback",
      YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED: "true",
      VIDEO_REVIEW_ACCESS_TOKEN,
      YIJIAN_VIDEO_REVIEW_ACCOUNT: "video-reviewer@yijian.test",
      YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED: "true",
      VIDEO_RECONCILIATION_ACCESS_TOKEN,
      YIJIAN_VIDEO_RECONCILIATION_ACCOUNT: "video-reconciler@yijian.test",
      VIDEO_WORKER_CONCURRENCY: "1",
      YIJIAN_VIDEO_WORKER_ENABLED: "true",
      VIDU_API_KEY: "synthetic-test-key",
      LLM_PROVIDER: "mock",
      TTS_PROVIDER: "mock",
      ...overrides,
    },
    mediaRoot: resolvedMediaRoot,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      if (ownsMediaRoot) rmSync(resolvedMediaRoot, { recursive: true, force: true });
      rmSync(videoSharedRoot, { recursive: true, force: true });
    },
  };
}

module.exports = { createStagingRuntimeTestEnvironment };
