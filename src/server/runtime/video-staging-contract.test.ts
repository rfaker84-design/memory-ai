import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

import {
  assertVideoWorkerStartupConfiguration,
  getVideoArtifactStorageConfiguration,
  VideoStagingRuntimeConfigurationError,
} from "./video-staging-contract";
import {
  authorizeVideoInternalRequest,
  getVideoInternalAccessConfiguration,
} from "../security/video-internal-access";

const { createStagingRuntimeTestEnvironment } = createRequire(import.meta.url)(
  "../../../scripts/test-support/staging-runtime-test-environment.cjs",
);

function stagingEnvironment(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return createStagingRuntimeTestEnvironment({ overrides }).environment;
}

test("production Node staging permits local artifacts only below its physical shared root", () => {
  const environment = stagingEnvironment();
  const configuration = getVideoArtifactStorageConfiguration(environment);
  assert.equal(environment.NODE_ENV, "production");
  assert.equal(environment.DEPLOYMENT_ENV, "staging");
  assert.ok(path.isAbsolute(configuration.artifactRoot));
  assert.ok(path.isAbsolute(configuration.evidenceRoot));
});

test("local staging artifacts fail closed for production deployment, formal origins, and relative paths", () => {
  const environment = stagingEnvironment();
  for (const override of [
    { DEPLOYMENT_ENV: "production" },
    { DEPLOYMENT_ENV: "" },
    { AUTH_ALLOWED_ORIGIN: "https://yijianmemory.cn" },
    { VIDEO_ARTIFACT_STAGING_ROOT: "relative/video-artifacts" },
  ]) {
    assert.throws(() => getVideoArtifactStorageConfiguration({ ...environment, ...override }));
  }
});

test("AI content provenance configuration is mandatory and rejects metadata injection", () => {
  const environment = stagingEnvironment();
  for (const override of [
    { AI_CONTENT_MARKING_PROVIDER_NAME: "" },
    { AI_CONTENT_MARKING_PROVIDER_CODE: "" },
    { AI_CONTENT_MARKING_PROVIDER_NAME: "MemoryAI\nforged=true" },
    { AI_CONTENT_MARKING_PROVIDER_CODE: "memoryai;owner_id=forged" },
  ]) {
    assert.throws(() => getVideoArtifactStorageConfiguration({ ...environment, ...override }));
  }
});

test("physical path checks reject shared-root escapes and directory symlink escapes", async () => {
  const sharedRoot = await mkdtemp(path.join(os.tmpdir(), "memoryai-video-contract-shared-"));
  const artifactRoot = path.join(sharedRoot, "artifacts");
  const evidenceRoot = path.join(sharedRoot, "evidence");
  const outside = await mkdtemp(path.join(os.tmpdir(), "memoryai-video-contract-outside-"));
  const linkedOutside = path.join(sharedRoot, "linked-outside");
  await mkdir(artifactRoot);
  await mkdir(evidenceRoot);
  await symlink(outside, linkedOutside, process.platform === "win32" ? "junction" : "dir");
  const environment = stagingEnvironment({
    VIDEO_STAGING_SHARED_ROOT: sharedRoot,
    VIDEO_ARTIFACT_STAGING_ROOT: artifactRoot,
    VIDEO_WORKER_EVIDENCE_ROOT: evidenceRoot,
  });
  try {
    assert.throws(() => getVideoArtifactStorageConfiguration({
      ...environment,
      VIDEO_ARTIFACT_STAGING_ROOT: outside,
    }), (error: unknown) => error instanceof VideoStagingRuntimeConfigurationError
      && error.code === "VIDEO_ARTIFACT_STAGING_ROOT_OUTSIDE_STAGING_SHARED_ROOT");
    assert.throws(() => getVideoArtifactStorageConfiguration({
      ...environment,
      VIDEO_ARTIFACT_STAGING_ROOT: linkedOutside,
    }), (error: unknown) => error instanceof VideoStagingRuntimeConfigurationError
      && error.code === "VIDEO_ARTIFACT_STAGING_ROOT_OUTSIDE_STAGING_SHARED_ROOT");
  } finally {
    await rm(sharedRoot, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("review and reconciliation access require distinct strong tokens, flags, and exact accounts", () => {
  const environment = stagingEnvironment();
  assert.doesNotThrow(() => getVideoInternalAccessConfiguration(environment));
  for (const override of [
    { VIDEO_REVIEW_ACCESS_TOKEN: "" },
    { VIDEO_RECONCILIATION_ACCESS_TOKEN: "short" },
    { VIDEO_RECONCILIATION_ACCESS_TOKEN: environment.VIDEO_REVIEW_ACCESS_TOKEN },
    { YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED: "false" },
    { YIJIAN_VIDEO_REVIEW_ACCOUNT: "" },
  ]) {
    assert.throws(() => getVideoInternalAccessConfiguration({ ...environment, ...override }));
  }
  assert.equal(authorizeVideoInternalRequest({
    kind: "review",
    token: environment.VIDEO_REVIEW_ACCESS_TOKEN!,
    account: environment.YIJIAN_VIDEO_REVIEW_ACCOUNT!,
  }, environment), environment.YIJIAN_VIDEO_REVIEW_ACCOUNT);
  assert.equal(authorizeVideoInternalRequest({
    kind: "review",
    token: environment.VIDEO_REVIEW_ACCESS_TOKEN!,
    account: "other-reviewer@yijian.test",
  }, environment), null);
});

test("internal video token rotation accepts only its own bounded previous token", () => {
  const environment = stagingEnvironment({
    VIDEO_REVIEW_ACCESS_TOKEN_PREVIOUS: "previous-review-A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0Uv",
    VIDEO_REVIEW_ACCESS_TOKEN_PREVIOUS_VALID_UNTIL: new Date(Date.now() + 9 * 60 * 1000).toISOString(),
  });
  assert.equal(authorizeVideoInternalRequest({
    kind: "review",
    token: environment.VIDEO_REVIEW_ACCESS_TOKEN_PREVIOUS!,
    account: environment.YIJIAN_VIDEO_REVIEW_ACCOUNT!,
  }, environment), environment.YIJIAN_VIDEO_REVIEW_ACCOUNT);
  assert.equal(authorizeVideoInternalRequest({
    kind: "reconciliation",
    token: environment.VIDEO_REVIEW_ACCESS_TOKEN_PREVIOUS!,
    account: environment.YIJIAN_VIDEO_RECONCILIATION_ACCOUNT!,
  }, environment), null);
  assert.throws(() => getVideoInternalAccessConfiguration({
    ...environment,
    VIDEO_REVIEW_ACCESS_TOKEN_PREVIOUS_VALID_UNTIL: new Date(Date.now() + 16 * 60 * 1000).toISOString(),
  }));
});

test("worker startup validation is configuration-only and does not create a job or call Vidu", () => {
  const environment = stagingEnvironment();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("fetch must not run during validation");
  }) as typeof fetch;
  try {
    assert.deepEqual(assertVideoWorkerStartupConfiguration(environment), {
      databaseName: "memoryai_staging",
      pollIntervalMs: 5_000,
      batchSize: 16,
    });
    assert.equal(fetchCalls, 0);
    assert.throws(() => assertVideoWorkerStartupConfiguration({
      ...environment,
      VIDEO_WORKER_CONCURRENCY: "2",
    }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the durable worker entry reruns the full Staging startup contract on every process start", () => {
  const worker = readFileSync(new URL("../../../scripts/video-worker.ts", import.meta.url), "utf8");
  assert.match(worker, /assertVideoWorkerStartupConfiguration\(\)/);
  assert.match(worker, /assertVideoWorkerRuntimeConfiguration\(\)/);
});
