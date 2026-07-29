import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { FirstPresenceVideoJob } from "./first-presence-video-service";
import { FirstPresenceVideoWorker } from "./first-presence-video-worker";
import { LocalStagingVideoArtifactStorage } from "./video-artifact-storage";
import { videoArtifactPresentation } from "./video-artifact-query";

const job = (id: string, status: FirstPresenceVideoJob["status"]): FirstPresenceVideoJob => ({
  id,
  externalUserId: "phone:owner",
  memoryId: "00000000-0000-4000-8000-000000000001",
  idempotencyKey: `video-worker-${id}`,
  status,
  provider: "vidu-cn-q2-pro-fast",
  providerTaskId: status === "submitted" ? "provider-task" : null,
  providerState: null,
  inputSha256: "a".repeat(64),
  actualCredits: null,
  artifactKey: null,
  quality: null,
  manualReview: null,
  errorCode: null,
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
});

test("local video staging is idempotent, private, and signs short playback grants", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "memoryai-video-artifacts-"));
  const storage = new LocalStagingVideoArtifactStorage({
    root,
    signingSecret: "v".repeat(48),
    playbackBaseUrl: "https://staging.yijian.test/internal/video-playback",
    downloader: {
      download: async ({ jobId }) => ({
        artifactKey: `first-presence/${jobId}.mp4`, body: Buffer.from("downloaded"), contentType: "video/mp4", finalUrl: "https://provider.example/video.mp4",
      }),
    },
  });
  const id = "00000000-0000-4000-8000-000000000011";
  await storage.stageInput({ jobId: id, imageDataUrl: "data:image/png;base64,YWJj" });
  assert.equal(await storage.readInput({ jobId: id }), "data:image/png;base64,YWJj");
  const downloaded = await storage.download({ url: "https://provider.example/video.mp4", jobId: id });
  const stored = await storage.stageArtifact({ jobId: id, body: downloaded.body, contentType: downloaded.contentType });
  await storage.stageArtifact({ jobId: id, body: downloaded.body, contentType: downloaded.contentType });
  assert.deepEqual(await storage.readArtifact({ artifactKey: stored.artifactKey }), Buffer.from("downloaded"));
  assert.deepEqual(
    await storage.readArtifactRange({ artifactKey: stored.artifactKey, start: 2, end: 5 }),
    { body: Buffer.from("wnlo"), contentType: "video/mp4", totalBytes: 10 },
  );
  await assert.rejects(
    storage.readArtifactRange({ artifactKey: "../escape.mp4", start: 0, end: 0 }),
    /VIDEO_ARTIFACT_INVALID_KEY/,
  );
  const signed = await storage.createSignedPlaybackUrl({ artifactKey: stored.artifactKey, expiresInSeconds: 60 });
  const parsed = new URL(signed.url);
  assert.equal(storage.verifySignedPlayback({
    artifactKey: stored.artifactKey,
    expiresAt: signed.expiresAt,
    signature: parsed.searchParams.get("signature")!,
  }), true);
  await storage.deleteArtifact({ artifactKey: stored.artifactKey });
  await assert.rejects(storage.readArtifact({ artifactKey: stored.artifactKey }));
});

test("multiple workers only process queued or safely recoverable persisted states", async () => {
  const queued = job("00000000-0000-4000-8000-000000000021", "queued");
  const submitted = job("00000000-0000-4000-8000-000000000022", "submitted");
  const uncertain = job("00000000-0000-4000-8000-000000000023", "submission_uncertain");
  const repository = {
    listWorkerCandidates: async () => [queued, submitted, uncertain],
  };
  const calls: string[] = [];
  const service = {
    processQueued: async (id: string) => { calls.push(`submit:${id}`); return queued; },
    recover: async (id: string) => { calls.push(`recover:${id}`); return submitted; },
  };
  const [a, b] = await Promise.all([
    new FirstPresenceVideoWorker(repository, service).runOnce(),
    new FirstPresenceVideoWorker(repository, service).runOnce(),
  ]);
  assert.equal(a.failures.length + b.failures.length, 0);
  assert.equal(calls.includes(`recover:${uncertain.id}`), false, "uncertain jobs are never recovered or re-submitted by workers");
  assert.equal(calls.filter((call) => call === `submit:${queued.id}`).length, 2, "workers rely on the repository's conditional claim for the single provider winner");
});

test("initial previews are explicitly non-save while later generations inherit Commerce save rights", () => {
  assert.deepEqual(videoArtifactPresentation({ purpose: "first_preview", creditLotSaveAllowed: true }), {
    presentation: "initial_preview",
    saveAllowed: false,
  });
  assert.deepEqual(videoArtifactPresentation({ purpose: "new_video", creditLotSaveAllowed: true }), {
    presentation: "additional_generation",
    saveAllowed: true,
  });
  assert.deepEqual(videoArtifactPresentation({ purpose: "referral_experience", creditLotSaveAllowed: false }), {
    presentation: "additional_generation",
    saveAllowed: false,
  });
});
