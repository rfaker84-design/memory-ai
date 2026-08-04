import assert from "node:assert/strict";
import test from "node:test";

import { OwnerWatermarkedShareDownloadService, WatermarkedShareDownloadError } from "./watermarked-share-download";

const input = { externalUserId: "owner", memoryId: "00000000-0000-4000-8000-000000000001", publicId: "00000000-0000-4000-8000-000000000003" };
const candidate = { ...input, jobId: "00000000-0000-4000-8000-000000000002", artifactKey: "video-artifacts/00000000-0000-4000-8000-000000000002.mp4" };

test("watermarked Owner download reads only an eligible artifact and records the completed ephemeral derivative", async () => {
  const calls: unknown[] = [];
  const service = new OwnerWatermarkedShareDownloadService(
    { async findWatermarkedDownloadForOwner(value) { calls.push(["find", value]); return candidate; }, async recordWatermarkedDownload(value) { calls.push(["audit", value]); return true; } },
    { async readArtifact(value) { calls.push(["read", value]); return Buffer.from("source"); } },
    { async render(value) { calls.push(["render", value]); return Buffer.from("watermarked"); } },
  );
  const result = await service.prepare(input);
  assert.equal(result.body.toString(), "watermarked");
  assert.equal(result.fileName, `memoryai-watermarked-${input.publicId}.mp4`);
  assert.deepEqual(calls.slice(0, 3), [["find", input], ["read", { artifactKey: candidate.artifactKey }], ["render", { body: Buffer.from("source"), contentId: candidate.jobId }]]);
  const audit = calls[3] as [string, { sha256: string; byteLength: number }];
  assert.equal(audit[0], "audit");
  assert.equal(audit[1].byteLength, 11);
  assert.match(audit[1].sha256, /^[a-f0-9]{64}$/);
});

test("no eligible share, render failure, or audit failure never returns a file", async () => {
  let reads = 0; let renders = 0; let audits = 0;
  const unavailable = new OwnerWatermarkedShareDownloadService({ async findWatermarkedDownloadForOwner() { return null; }, async recordWatermarkedDownload() { audits += 1; return true; } }, { async readArtifact() { reads += 1; return Buffer.alloc(1); } }, { async render() { renders += 1; return Buffer.alloc(1); } });
  await assert.rejects(() => unavailable.prepare(input), (error: unknown) => error instanceof WatermarkedShareDownloadError && error.code === "SHARE_DOWNLOAD_NOT_AVAILABLE");
  assert.deepEqual([reads, renders, audits], [0, 0, 0]);
  const renderFailure = new OwnerWatermarkedShareDownloadService({ async findWatermarkedDownloadForOwner() { return candidate; }, async recordWatermarkedDownload() { audits += 1; return true; } }, { async readArtifact() { return Buffer.from("source"); } }, { async render() { throw new Error("ffmpeg failed"); } });
  await assert.rejects(() => renderFailure.prepare(input), (error: unknown) => !(error instanceof WatermarkedShareDownloadError) || error.code === "SHARE_DOWNLOAD_RENDER_FAILED");
  assert.equal(audits, 0);
  const auditFailure = new OwnerWatermarkedShareDownloadService({ async findWatermarkedDownloadForOwner() { return candidate; }, async recordWatermarkedDownload() { return false; } }, { async readArtifact() { return Buffer.from("source"); } }, { async render() { return Buffer.from("watermarked"); } });
  await assert.rejects(() => auditFailure.prepare(input), (error: unknown) => error instanceof WatermarkedShareDownloadError && error.code === "SHARE_DOWNLOAD_AUDIT_FAILED");
});
