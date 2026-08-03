import assert from "node:assert/strict";
import test from "node:test";

import { TencentCosVideoArtifactStorage } from "./tencent-cos-video-artifact-storage";
import { assertVideoWorkerRuntimeConfiguration, getVideoArtifactRuntimeConfiguration } from "./video-artifact-runtime";
import { createVideoArtifactStorageFromEnvironment } from "./video-artifact-storage";

const production = {
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "production",
  VIDEO_ARTIFACT_STORAGE_PROVIDER: "cos",
  VIDEO_WORKER_EVIDENCE_ROOT: "C:/memoryai/video-evidence",
  VIDEO_ARTIFACT_SIGNING_SECRET: "s".repeat(48),
  VIDEO_ARTIFACT_PLAYBACK_BASE_URL: "https://memoryai.test/api/first-presence-video/playback",
  AI_CONTENT_MARKING_PROVIDER_NAME: "MemoryAI",
  AI_CONTENT_MARKING_PROVIDER_CODE: "memoryai",
  COS_VIDEO_ARTIFACT_BUCKET: "memoryai-video-1250000000",
  COS_VIDEO_ARTIFACT_REGION: "ap-guangzhou",
  TENCENT_SECRET_ID: "test-secret-id",
  TENCENT_SECRET_KEY: "test-secret-key",
  YIJIAN_VIDEO_WORKER_ENABLED: "true",
  VIDEO_WORKER_CONCURRENCY: "1",
  VIDU_API_KEY: "synthetic-video-worker-key",
};

test("production artifact runtime is COS-only, explicit and fail-closed", () => {
  const runtime = getVideoArtifactRuntimeConfiguration(production);
  assert.equal(runtime.kind, "cos");
  assert.equal(runtime.bucket, production.COS_VIDEO_ARTIFACT_BUCKET);
  assert.equal(runtime.evidenceRoot, "C:\\memoryai\\video-evidence");
  assert.throws(() => getVideoArtifactRuntimeConfiguration({ ...production, VIDEO_ARTIFACT_STORAGE_PROVIDER: "local-staging" }));
  assert.throws(() => getVideoArtifactRuntimeConfiguration({ ...production, COS_VIDEO_ARTIFACT_BUCKET: "" }));
  assert.throws(() => getVideoArtifactRuntimeConfiguration({ ...production, VIDEO_WORKER_EVIDENCE_ROOT: "relative" }));
});

test("production worker startup requires exact single-worker capability and safe Vidu key shape", () => {
  assert.equal(assertVideoWorkerRuntimeConfiguration(production).kind, "cos");
  assert.throws(() => assertVideoWorkerRuntimeConfiguration({ ...production, VIDEO_WORKER_CONCURRENCY: "2" }));
  assert.throws(() => assertVideoWorkerRuntimeConfiguration({ ...production, YIJIAN_VIDEO_WORKER_ENABLED: "false" }));
  assert.throws(() => assertVideoWorkerRuntimeConfiguration({ ...production, VIDU_API_KEY: "Bearer token" }));
});

test("production storage factory creates a COS adapter without a network operation", () => {
  assert.ok(createVideoArtifactStorageFromEnvironment(production) instanceof TencentCosVideoArtifactStorage);
});
