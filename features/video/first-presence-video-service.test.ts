import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { NextRequest } from "next/server";

import { createVideoReviewsHandler } from "@/app/api/internal/video-reviews/_handler";
import {
  evaluateFirstPresenceQuality,
  FfmpegFirstPresenceMediaInspector,
  FirstPresenceVideoService,
  SecureVideoDownloader,
  VideoDownloadSecurityError,
  ViduFirstPresenceNetworkError,
  ViduFirstPresenceProvider,
  VIDU_CN_API_BASE_URL,
  VIDU_FIRST_PRESENCE_DURATION_SECONDS,
  VIDU_FIRST_PRESENCE_MODEL,
  VIDU_FIRST_PRESENCE_NEGATIVE_PROMPT,
  VIDU_FIRST_PRESENCE_PROMPT,
  VIDU_FIRST_PRESENCE_RESOLUTION,
  type FirstPresenceQualityDecision,
  type FirstPresenceVideoJob,
  type FirstPresenceVideoRepository,
} from "./index";

const execFileAsync = promisify(execFile);
const owner = "phone:owner";
const memoryId = "00000000-0000-4000-8000-000000000021";
const image = "data:image/png;base64,YWJj";
const sha = "a".repeat(64);
const sampleA =
  "C:/Users/Administrator/Documents/Codex/2026-07-27/sprint21-memorial-video-bakeoff-and-pipeline/work/vidu-first-presence-8s-confirmation/videos/A.mp4";
const sampleB =
  "C:/Users/Administrator/Documents/Codex/2026-07-27/sprint21-memorial-video-bakeoff-and-pipeline/work/vidu-first-presence-8s-confirmation/videos/B.mp4";

class MemoryFirstPresenceRepository implements FirstPresenceVideoRepository {
  readonly jobs = new Map<string, FirstPresenceVideoJob>();
  private sequence = 0;

  async findByIdempotencyKey(input: {
    externalUserId: string;
    memoryId: string;
    idempotencyKey: string;
  }) {
    return (
      [...this.jobs.values()].find(
        (job) =>
          job.externalUserId === input.externalUserId &&
          job.memoryId === input.memoryId &&
          job.idempotencyKey === input.idempotencyKey
      ) ?? null
    );
  }

  async findById(id: string) {
    return this.jobs.get(id) ?? null;
  }

  async createQueued(input: {
    externalUserId: string;
    memoryId: string;
    idempotencyKey: string;
    imageSha256: string;
  }) {
    const existing = [...this.jobs.values()].find(
      (job) => job.externalUserId === input.externalUserId
        && job.memoryId === input.memoryId
        && job.idempotencyKey === input.idempotencyKey
    );
    if (existing) return existing;
    const now = new Date().toISOString();
    const job: FirstPresenceVideoJob = {
      id: `first-presence-video-${++this.sequence}`,
      externalUserId: input.externalUserId,
      memoryId: input.memoryId,
      idempotencyKey: input.idempotencyKey,
      status: "queued",
      provider: "vidu-cn-q2-pro-fast",
      providerTaskId: null,
      providerState: null,
      inputSha256: input.imageSha256,
      actualCredits: null,
      artifactKey: null,
      quality: null,
      manualReview: null,
      errorCode: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async claimSubmission(id: string) {
    const current = this.jobs.get(id);
    if (!current || current.status !== "queued") return null;
    return this.patch(id, { status: "submitting" });
  }

  async markSubmitted(input: {
    id: string;
    providerTaskId: string;
    providerState: string;
    actualCredits: number | null;
  }) {
    return this.patch(input.id, {
      status: "submitted",
      providerTaskId: input.providerTaskId,
      providerState: input.providerState,
      actualCredits: input.actualCredits,
    });
  }

  async markRunning(input: {
    id: string;
    providerState: string;
    actualCredits: number | null;
  }) {
    return this.patch(input.id, {
      status: "running",
      providerState: input.providerState,
      actualCredits: input.actualCredits,
    });
  }

  async markReserved(id: string) {
    return this.jobs.get(id) ?? Promise.reject(new Error("missing job"));
  }

  async markQualityPending(input: {
    id: string;
    providerState: string;
    actualCredits: number | null;
  }) {
    return this.patch(input.id, {
      status: "quality_pending",
      providerState: input.providerState,
      actualCredits: input.actualCredits,
    });
  }

  async markSubmissionUncertain(input: { id: string; errorCode: string }) {
    return this.patch(input.id, {
      status: "submission_uncertain",
      errorCode: input.errorCode,
    });
  }

  async markFailed(input: {
    id: string;
    providerState: string | null;
    actualCredits: number | null;
    errorCode: string;
  }) {
    return this.patch(input.id, {
      status: "failed",
      providerState: input.providerState,
      actualCredits: input.actualCredits,
      errorCode: input.errorCode,
    });
  }

  async markManualReviewRequired(input: Parameters<FirstPresenceVideoRepository["markManualReviewRequired"]>[0]) {
    return this.patch(input.id, {
      status: "manual_review_required",
      providerState: input.providerState,
      actualCredits: input.actualCredits,
      artifactKey: input.artifactKey,
      quality: input.quality,
    });
  }

  async settleManualReview(input: Parameters<FirstPresenceVideoRepository["settleManualReview"]>[0]) {
    const current = this.jobs.get(input.id);
    if (!current) throw new Error("missing job");
    if (["succeeded", "rejected"].includes(current.status)) return current;
    if (current.status !== "manual_review_required") {
      throw new Error("FIRST_PRESENCE_VIDEO_NOT_REVIEWABLE");
    }
    return this.patch(input.id, input.manualReview.action === "approve"
      ? { status: "succeeded", manualReview: input.manualReview }
      : {
        status: "rejected",
        manualReview: input.manualReview,
        errorCode: "MANUAL_REVIEW_REJECTED",
      });
  }

  async markRejected(input: Parameters<FirstPresenceVideoRepository["markRejected"]>[0]) {
    return this.patch(input.id, {
      status: "rejected",
      providerState: input.providerState,
      actualCredits: input.actualCredits,
      artifactKey: input.artifactKey,
      quality: input.quality,
      manualReview: input.manualReview ?? null,
      errorCode: input.errorCode,
    });
  }

  async markSucceeded(input: Parameters<FirstPresenceVideoRepository["markSucceeded"]>[0]) {
    return this.patch(input.id, {
      status: "succeeded",
      providerState: input.providerState,
      actualCredits: input.actualCredits,
      artifactKey: input.artifactKey,
      quality: input.quality,
      manualReview: input.manualReview,
    });
  }

  private patch(id: string, patch: Partial<FirstPresenceVideoJob>) {
    const current = this.jobs.get(id);
    if (!current) throw new Error("missing job");
    const updated = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, updated);
    return updated;
  }
}

class FakeEntitlements {
  reserves = 0;
  commits = 0;
  releases = 0;

  async reserve() {
    this.reserves += 1;
    return "reserved" as const;
  }

  async release() {
    this.releases += 1;
  }

  async commit() {
    this.commits += 1;
  }
}

function validProbe(evidenceRoot: string) {
  return {
    durationSeconds: 8.083,
    width: 1080,
    height: 1920,
    codec: "h264",
    sizeBytes: 1024,
    hasAudio: false,
    decodable: true,
    evidence: {
      firstFramePath: path.join(evidenceRoot, "first.jpg"),
      actionFramePath: path.join(evidenceRoot, "action.jpg"),
      finalFramePath: path.join(evidenceRoot, "final.jpg"),
    },
  };
}

function serviceWith(input: {
  provider?: ConstructorParameters<typeof FirstPresenceVideoService>[1];
  quality?: FirstPresenceQualityDecision;
} = {}) {
  const repository = new MemoryFirstPresenceRepository();
  const entitlements = new FakeEntitlements();
  const provider =
    input.provider ??
    ({
      submit: async () => ({
        taskId: "vidu-task-1",
        providerState: "created",
        credits: 44,
      }),
      poll: async () => ({
        state: "succeeded",
        providerState: "success",
        credits: 44,
        outputUrl: "https://example.test/video.mp4",
      }),
    } as ConstructorParameters<typeof FirstPresenceVideoService>[1]);
  const service = new FirstPresenceVideoService(
    repository,
    provider,
    entitlements,
    {
      download: async () => ({
        artifactKey: "first-presence/video.mp4",
        body: Buffer.from("mp4"),
      }),
    },
    {
      inspect: async () =>
        input.quality?.media ?? validProbe(path.join(os.tmpdir(), "first-presence-evidence")),
    },
    {
      assertCanReview: ({ reviewerAccount }) => {
        if (reviewerAccount !== "internal-reviewer@yijian.test") {
          throw new Error("FIRST_PRESENCE_REVIEW_UNAUTHORIZED");
        }
      },
    }
  );
  return { service, repository, entitlements };
}

test("Vidu first-presence provider freezes the China Q2 Pro Fast 8s silent 1080p contract", async () => {
  const requests: Array<{
    url: string;
    method: string;
    authorization: string | null;
    body: Record<string, unknown>;
  }> = [];
  const fakeFetch = (async (
    request: URL | RequestInfo,
    init?: RequestInit
  ) => {
    requests.push({
      url: String(request),
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("Authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    if (String(request).endsWith("/img2video")) {
      return Response.json({ task_id: "vidu-task-1", state: "created", credits: 44 });
    }
    return Response.json({
      state: "success",
      credits: 44,
      creations: [{ url: "https://example.test/video.mp4" }],
    });
  }) as typeof fetch;
  const provider = new ViduFirstPresenceProvider({
    environment: { VIDU_API_KEY: "raw-key" },
    fetchImpl: fakeFetch,
  });

  await provider.submit({
    imageDataUrl: image,
    imageSha256: sha,
    idempotencyKey: "first-presence-job-1",
  });
  await provider.poll("vidu-task-1");

  assert.deepEqual(
    requests.map((request) => [request.url, request.method]),
    [
      [`${VIDU_CN_API_BASE_URL}/ent/v2/img2video`, "POST"],
      [`${VIDU_CN_API_BASE_URL}/ent/v2/tasks/vidu-task-1/creations`, "GET"],
    ]
  );
  assert.equal(requests[0].authorization, "Token raw-key");
  assert.equal(requests[1].authorization, "Token raw-key");
  assert.equal(requests[0].body.model, VIDU_FIRST_PRESENCE_MODEL);
  assert.equal(requests[0].body.duration, VIDU_FIRST_PRESENCE_DURATION_SECONDS);
  assert.equal(requests[0].body.resolution, VIDU_FIRST_PRESENCE_RESOLUTION);
  assert.equal(requests[0].body.audio, false);
  assert.equal(requests[0].body.bgm, false);
  assert.equal(requests[0].body.is_rec, false);
  assert.equal(requests[0].body.prompt, VIDU_FIRST_PRESENCE_PROMPT);
  assert.equal(requests[0].body.negative_prompt, VIDU_FIRST_PRESENCE_NEGATIVE_PROMPT);
});

test("secure downloader rejects client supplied unsafe URLs, private redirects, and oversized files", async () => {
  const downloader = new SecureVideoDownloader({
    resolveHost: async (hostname) =>
      hostname === "safe.example.test" ? ["203.0.113.10"] : ["127.0.0.1"],
    fetchImpl: (async () => Response.json({}, { status: 200 })) as typeof fetch,
  });
  await assert.rejects(
    downloader.download({ url: "http://safe.example.test/video.mp4", jobId: "job-1" }),
    (error) => error instanceof VideoDownloadSecurityError && error.code === "VIDEO_URL_NOT_HTTPS"
  );
  await assert.rejects(
    downloader.download({ url: "https://127.0.0.1/video.mp4", jobId: "job-1" }),
    (error) => error instanceof VideoDownloadSecurityError && error.code === "VIDEO_URL_PRIVATE_ADDRESS"
  );

  const redirected = new SecureVideoDownloader({
    resolveHost: async (hostname) =>
      hostname === "safe.example.test" ? ["203.0.113.10"] : ["127.0.0.1"],
    fetchImpl: (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://private.example.test/video.mp4" },
      })) as typeof fetch,
  });
  await assert.rejects(
    redirected.download({ url: "https://safe.example.test/video.mp4", jobId: "job-1" }),
    (error) => error instanceof VideoDownloadSecurityError && error.code === "VIDEO_URL_PRIVATE_ADDRESS"
  );

  const oversized = new SecureVideoDownloader({
    maxBytes: 8,
    resolveHost: async () => ["203.0.113.10"],
    fetchImpl: (async () =>
      new Response(Buffer.alloc(9), {
        status: 200,
        headers: { "content-length": "9", "content-type": "video/mp4" },
      })) as typeof fetch,
  });
  await assert.rejects(
    oversized.download({ url: "https://safe.example.test/video.mp4", jobId: "job-1" }),
    (error) => error instanceof VideoDownloadSecurityError && error.code === "VIDEO_TOO_LARGE"
  );
});

test("real ffprobe and ffmpeg inspection accepts the current A/B smoke videos as manual review evidence", async () => {
  await access(sampleA);
  await access(sampleB);
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "first-presence-evidence-"));
  const inspector = new FfmpegFirstPresenceMediaInspector({ evidenceRoot });
  for (const [name, file] of [["A", sampleA], ["B", sampleB]] as const) {
    const probe = await inspector.inspect({
      artifactKey: `sample-${name}.mp4`,
      body: await readFile(file),
    });
    const decision = evaluateFirstPresenceQuality({ media: probe });
    assert.equal(probe.codec, "h264");
    assert.equal(probe.width, 1080);
    assert.equal(probe.height, 1920);
    assert.equal(Math.abs(probe.durationSeconds - 8) <= 0.5, true);
    assert.equal(probe.hasAudio, false);
    assert.equal(probe.decodable, true);
    await access(probe.evidence.firstFramePath);
    await access(probe.evidence.actionFramePath);
    await access(probe.evidence.finalFramePath);
    assert.equal(decision.status, "manual_review_required");
    assert.deepEqual(decision.manualReviewReasons, [
      "IDENTITY_STABILITY_UNVERIFIED",
      "PERSON_LEAVING_FRAME_UNVERIFIED",
      "FINAL_FRAME_PERSON_PRESENCE_UNVERIFIED",
      "BODY_OR_HAND_ABNORMALITY_UNVERIFIED",
    ]);
  }
});

test("real ffprobe and ffmpeg inspection rejects a fault video without charging user entitlement", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "first-presence-fault-"));
  const fault = path.join(temp, "fault.mp4");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=320x240:d=2",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=mono:sample_rate=44100",
    "-shortest",
    fault,
  ]);
  const inspector = new FfmpegFirstPresenceMediaInspector({
    evidenceRoot: path.join(temp, "evidence"),
  });
  const decision = evaluateFirstPresenceQuality({
    media: await inspector.inspect({
      artifactKey: "fault.mp4",
      body: await readFile(fault),
    }),
  });
  assert.equal(decision.status, "reject");
  assert.deepEqual(decision.reasons, [
    "MEDIA_DURATION_INVALID",
    "MEDIA_RESOLUTION_INVALID",
    "MEDIA_AUDIO_PRESENT",
  ]);

  const rejected = serviceWith({ quality: decision });
  const job = await rejected.service.submit({
    externalUserId: owner,
    memoryId,
    idempotencyKey: "video-request-fault",
    imageDataUrl: image,
    imageSha256: sha,
  });
  const result = await rejected.service.recover(job.id);
  assert.equal(result.status, "rejected");
  assert.equal(rejected.entitlements.releases, 1);
  assert.equal(rejected.entitlements.commits, 0);
});

test("idempotent submission and lost response recovery protection never submit or reserve twice", async () => {
  let submits = 0;
  const idempotent = serviceWith({
    provider: {
      submit: async () => {
        submits += 1;
        return { taskId: "vidu-task-1", providerState: "created", credits: 44 };
      },
      poll: async () => {
        throw new Error("unused");
      },
    },
  });
  const input = {
    externalUserId: owner,
    memoryId,
    idempotencyKey: "video-request-1",
    imageDataUrl: image,
    imageSha256: sha,
  };
  assert.equal((await idempotent.service.submit(input)).id, (await idempotent.service.submit(input)).id);
  assert.equal(submits, 1);
  assert.equal(idempotent.entitlements.reserves, 1);

  const uncertain = serviceWith({
    provider: {
      submit: async () => {
        submits += 1;
        throw new ViduFirstPresenceNetworkError();
      },
      poll: async () => {
        throw new Error("unused");
      },
    },
  });
  const first = await uncertain.service.submit({ ...input, idempotencyKey: "video-request-2" });
  const replay = await uncertain.service.submit({ ...input, idempotencyKey: "video-request-2" });
  const recoveries = await Promise.all(
    Array.from({ length: 12 }, () => uncertain.service.recover(first.id)),
  );
  assert.equal(first.status, "submission_uncertain");
  assert.equal(replay.id, first.id);
  assert.equal(recoveries.every((job) => job.status === "submission_uncertain"), true);
  assert.equal(submits, 2, "uncertain recovery never re-submits to the provider");
  assert.equal(uncertain.entitlements.commits, 0);
  assert.equal(uncertain.entitlements.releases, 0);
});

test("concurrent submitters claim one durable submission and call Vidu once", async () => {
  let submits = 0;
  const { service, entitlements } = serviceWith({
    provider: {
      submit: async () => {
        submits += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { taskId: "vidu-task-race", providerState: "created", credits: 44 };
      },
      poll: async () => {
        throw new Error("unused");
      },
    },
  });
  const raceInput = {
    externalUserId: owner,
    memoryId,
    idempotencyKey: "video-request-race",
    imageDataUrl: image,
    imageSha256: sha,
  };
  const jobs = await Promise.all(Array.from({ length: 12 }, () => service.submit(raceInput)));
  assert.equal(new Set(jobs.map((job) => job.id)).size, 1);
  assert.equal(submits, 1);
  assert.equal(entitlements.reserves, 1);
});

test("state recovery stores actual credits and requires internal manual review before consuming entitlement", async () => {
  const { service, entitlements } = serviceWith();
  const submitted = await service.submit({
    externalUserId: owner,
    memoryId,
    idempotencyKey: "video-request-3",
    imageDataUrl: image,
    imageSha256: sha,
  });

  const reviewable = await service.recover(submitted.id);
  assert.equal(reviewable.status, "manual_review_required");
  assert.equal(reviewable.actualCredits, 44);
  assert.equal(entitlements.commits, 0);
  assert.equal(entitlements.releases, 0);

  await assert.rejects(
    service.review({
      jobId: submitted.id,
      reviewerAccount: "client@yijian.test",
      action: "approve",
      reason: "forged client approval",
    }),
    /FIRST_PRESENCE_REVIEW_UNAUTHORIZED/
  );

  const approved = await service.review({
    jobId: submitted.id,
    reviewerAccount: "internal-reviewer@yijian.test",
    action: "approve",
    reason: "A/B evidence reviewed by operator",
    now: new Date("2026-07-28T06:00:00.000Z"),
  });
  assert.equal(approved.status, "succeeded");
  assert.equal(approved.manualReview?.reviewerAccount, "internal-reviewer@yijian.test");
  assert.equal(approved.manualReview?.reason, "A/B evidence reviewed by operator");
  assert.equal(entitlements.commits, 0, "review settlement belongs to the repository transaction");
});

test("manual reject releases the user entitlement and records reviewer, time, and reason", async () => {
  const { service, entitlements } = serviceWith();
  const submitted = await service.submit({
    externalUserId: owner,
    memoryId,
    idempotencyKey: "video-request-4",
    imageDataUrl: image,
    imageSha256: sha,
  });
  await service.recover(submitted.id);
  const rejected = await service.review({
    jobId: submitted.id,
    reviewerAccount: "internal-reviewer@yijian.test",
    action: "reject",
    reason: "final frame evidence does not satisfy owner standard",
    now: new Date("2026-07-28T06:01:00.000Z"),
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.errorCode, "MANUAL_REVIEW_REJECTED");
  assert.equal(rejected.manualReview?.reviewedAt, "2026-07-28T06:01:00.000Z");
  assert.equal(entitlements.releases, 0, "review settlement belongs to the repository transaction");
  assert.equal(entitlements.commits, 0);
});

test("internal video review route requires internal flag, exact account, token, and strict body", async () => {
  const previous = {
    enabled: process.env.YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED,
    token: process.env.YIJIAN_VIDEO_REVIEW_ACCESS_TOKEN,
    account: process.env.YIJIAN_VIDEO_REVIEW_ACCOUNT,
  };
  const token = "v".repeat(48);
  const reviewer = "internal-reviewer@yijian.test";
  try {
    delete process.env.YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED;
    process.env.YIJIAN_VIDEO_REVIEW_ACCESS_TOKEN = token;
    process.env.YIJIAN_VIDEO_REVIEW_ACCOUNT = reviewer;
    let calls = 0;
    const handler = createVideoReviewsHandler(() => ({
      review: async (input) => {
        calls += 1;
        return {
          id: input.jobId,
          status: input.action === "approve" ? "succeeded" : "rejected",
          manualReview: {
            reviewerAccount: input.reviewerAccount,
            reviewedAt: "2026-07-28T06:00:00.000Z",
            action: input.action,
            reason: input.reason,
          },
        } as never;
      },
    }));
    const unauthorized = await handler(new NextRequest("https://memoryai.test/api/internal/video-reviews", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-video-review-access-token": token,
        "x-video-reviewer-account": reviewer,
      },
      body: JSON.stringify({ jobId: "first-presence-video-1", action: "approve", reason: "ok" }),
    }));
    assert.equal(unauthorized.status, 401);

    process.env.YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED = "true";
    const wrongAccount = await handler(new NextRequest("https://memoryai.test/api/internal/video-reviews", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-video-review-access-token": token,
        "x-video-reviewer-account": "client@yijian.test",
      },
      body: JSON.stringify({ jobId: "first-presence-video-1", action: "approve", reason: "ok" }),
    }));
    assert.equal(wrongAccount.status, 401);

    const forgedBody = await handler(new NextRequest("https://memoryai.test/api/internal/video-reviews", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-video-review-access-token": token,
        "x-video-reviewer-account": reviewer,
      },
      body: JSON.stringify({
        jobId: "first-presence-video-1",
        action: "approve",
        reason: "ok",
        reviewerAccount: "client@yijian.test",
      }),
    }));
    assert.equal(forgedBody.status, 400);

    const approved = await handler(new NextRequest("https://memoryai.test/api/internal/video-reviews", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-video-review-access-token": token,
        "x-video-reviewer-account": reviewer,
      },
      body: JSON.stringify({ jobId: "first-presence-video-1", action: "approve", reason: "operator checked frames" }),
    }));
    assert.equal(approved.status, 202);
    assert.equal(calls, 1);
  } finally {
    if (previous.enabled === undefined) delete process.env.YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED;
    else process.env.YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED = previous.enabled;
    if (previous.token === undefined) delete process.env.YIJIAN_VIDEO_REVIEW_ACCESS_TOKEN;
    else process.env.YIJIAN_VIDEO_REVIEW_ACCESS_TOKEN = previous.token;
    if (previous.account === undefined) delete process.env.YIJIAN_VIDEO_REVIEW_ACCOUNT;
    else process.env.YIJIAN_VIDEO_REVIEW_ACCOUNT = previous.account;
  }
});
