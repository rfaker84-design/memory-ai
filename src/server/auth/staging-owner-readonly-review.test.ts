import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import {
  isDirectStagingOwnerVisualRepairRequest,
  isDirectStagingOwnerReadOnlyReviewRequest,
  stagingOwnerReadOnlyReviewWindow,
  stagingOwnerVisualRepairWindow,
} from "./staging-owner-readonly-review";

const memoryId = "00000000-0000-4000-8000-000000000001";

function environment(expiresAt: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "staging",
    STAGING_OWNER_READONLY_REVIEW_MEMORY_ID: memoryId,
    STAGING_VISUAL_REVIEW_EXPIRES_AT: expiresAt,
  };
}

test("direct owner review accepts only a bounded absolute Staging window", () => {
  const now = new Date("2026-08-23T12:00:00.000Z");
  assert.equal(
    stagingOwnerReadOnlyReviewWindow(environment("2026-08-23T12:30:00.000Z"), now)?.memoryId,
    memoryId,
  );
  assert.equal(stagingOwnerReadOnlyReviewWindow(environment("2026-08-23T12:30:00.001Z"), now), null);
  assert.equal(stagingOwnerReadOnlyReviewWindow(environment("2026-08-23T12:00:00.000Z"), now), null);
  assert.equal(stagingOwnerReadOnlyReviewWindow({ ...environment("2026-08-23T12:30:00.000Z"), DEPLOYMENT_ENV: "production" }, now), null);
});

test("direct owner review accepts only Nginx-marked GET or HEAD on the Staging host", () => {
  const keys = ["NODE_ENV", "DEPLOYMENT_ENV", "STAGING_OWNER_READONLY_REVIEW_MEMORY_ID", "STAGING_VISUAL_REVIEW_EXPIRES_AT"] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  Object.assign(mutableEnvironment, environment(new Date(Date.now() + 60_000).toISOString()));
  try {
    const headers = { "x-memoryai-staging-visual-review": "1" };
    assert.equal(isDirectStagingOwnerReadOnlyReviewRequest(new NextRequest("https://app.staging.yijianmemory.cn/companion", { headers })), true);
    assert.equal(isDirectStagingOwnerReadOnlyReviewRequest(new NextRequest("https://app.staging.yijianmemory.cn/companion", { method: "HEAD", headers })), true);
    assert.equal(isDirectStagingOwnerReadOnlyReviewRequest(new NextRequest("https://app.staging.yijianmemory.cn/companion", { method: "POST", headers })), false);
    assert.equal(isDirectStagingOwnerReadOnlyReviewRequest(new NextRequest("https://api.staging.yijianmemory.cn/companion", { headers })), false);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete mutableEnvironment[key];
      else mutableEnvironment[key] = value;
    }
  }
});

test("visual repair accepts only the bounded Nginx-marked Staging regression window", () => {
  const now = new Date("2026-08-23T12:00:00.000Z");
  const repairEnvironment = {
    ...environment("2026-08-23T12:30:00.000Z"),
    STAGING_OWNER_VISUAL_REPAIR_EXPIRES_AT: "2026-08-23T12:30:00.000Z",
  };
  assert.equal(stagingOwnerVisualRepairWindow(repairEnvironment, now)?.memoryId, memoryId);
  assert.equal(stagingOwnerVisualRepairWindow({ ...repairEnvironment, STAGING_OWNER_VISUAL_REPAIR_EXPIRES_AT: "2026-08-23T12:30:00.001Z" }, now), null);

  const keys = [
    "NODE_ENV",
    "DEPLOYMENT_ENV",
    "STAGING_OWNER_READONLY_REVIEW_MEMORY_ID",
    "STAGING_VISUAL_REVIEW_EXPIRES_AT",
    "STAGING_OWNER_VISUAL_REPAIR_EXPIRES_AT",
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  Object.assign(mutableEnvironment, {
    ...repairEnvironment,
    STAGING_OWNER_VISUAL_REPAIR_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
  });
  try {
    const headers = { "x-memoryai-staging-visual-repair": "1" };
    assert.equal(isDirectStagingOwnerVisualRepairRequest(new NextRequest("https://app.staging.yijianmemory.cn/api/memory-chat", { method: "POST", headers })), true);
    assert.equal(isDirectStagingOwnerVisualRepairRequest(new NextRequest("https://api.staging.yijianmemory.cn/api/memory-chat", { method: "POST", headers })), false);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete mutableEnvironment[key];
      else mutableEnvironment[key] = value;
    }
  }
});
