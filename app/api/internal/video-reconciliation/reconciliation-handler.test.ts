import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createVideoReconciliationHandler } from "./_handler";

const token = "r".repeat(48);
const account = "reconciler@yijian.test";
const jobId = "00000000-0000-4000-8000-000000000021";
const key = "video:reconciliation:request:0001";

test("uncertain reconciliation is internal-only, timing-token guarded, and body-strict", async () => {
  const previous = {
    enabled: process.env.YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED,
    token: process.env.YIJIAN_VIDEO_RECONCILIATION_ACCESS_TOKEN,
    account: process.env.YIJIAN_VIDEO_RECONCILIATION_ACCOUNT,
  };
  const calls: Array<Record<string, unknown>> = [];
  const handler = createVideoReconciliationHandler(() => ({
    reconcile: async (input) => {
      calls.push(input);
      return { id: input.jobId, status: "submitted" } as never;
    },
  }));
  const request = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    handler(new NextRequest("https://memoryai.test/api/internal/video-reconciliation", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }));
  try {
    process.env.YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED = "true";
    process.env.YIJIAN_VIDEO_RECONCILIATION_ACCESS_TOKEN = token;
    process.env.YIJIAN_VIDEO_RECONCILIATION_ACCOUNT = account;

    assert.equal((await request({ action: "RELEASE_UNRESOLVED", jobId, idempotencyKey: key, reason: "confirmed absent" })).status, 401);
    assert.equal((await request(
      { action: "RELEASE_UNRESOLVED", jobId, idempotencyKey: key, reason: "confirmed absent" },
      { "x-video-reconciliation-access-token": "short", "x-video-reconciliation-account": account },
    )).status, 401);
    assert.equal((await request(
      { action: "RELEASE_UNRESOLVED", jobId, idempotencyKey: key, reason: "confirmed absent" },
      { "x-video-reconciliation-access-token": token, "x-video-reconciliation-account": "forged@yijian.test" },
    )).status, 401);
    assert.equal((await request(
      { action: "ATTACH_PROVIDER_TASK", jobId, idempotencyKey: key, providerTaskId: "vidu-task-1", reason: "operator confirmed", reviewerAccount: "forged" },
      { "x-video-reconciliation-access-token": token, "x-video-reconciliation-account": account },
    )).status, 400);

    const attached = await request(
      { action: "ATTACH_PROVIDER_TASK", jobId, idempotencyKey: key, providerTaskId: "vidu-task-1", reason: "operator confirmed" },
      { "x-video-reconciliation-access-token": token, "x-video-reconciliation-account": account },
    );
    assert.equal(attached.status, 200);
    assert.deepEqual(calls, [{
      jobId,
      idempotencyKey: key,
      operatorAccount: account,
      action: "ATTACH_PROVIDER_TASK",
      providerTaskId: "vidu-task-1",
      reason: "operator confirmed",
    }]);
  } finally {
    if (previous.enabled === undefined) delete process.env.YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED;
    else process.env.YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED = previous.enabled;
    if (previous.token === undefined) delete process.env.YIJIAN_VIDEO_RECONCILIATION_ACCESS_TOKEN;
    else process.env.YIJIAN_VIDEO_RECONCILIATION_ACCESS_TOKEN = previous.token;
    if (previous.account === undefined) delete process.env.YIJIAN_VIDEO_RECONCILIATION_ACCOUNT;
    else process.env.YIJIAN_VIDEO_RECONCILIATION_ACCOUNT = previous.account;
  }
});
