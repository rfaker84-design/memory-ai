import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import COS from "cos-nodejs-sdk-v5";

import type { AiContentMarker } from "./ai-content-marking";
import type { SecureVideoDownloader } from "./first-presence-media-inspection";
import type { VideoArtifactStoragePort, StagedVideoArtifact, VideoPlaybackRendition } from "./video-artifact-storage";

const OUTPUT = /^video-artifacts\/[0-9a-f-]{16,64}\.mp4$/i;
const MOBILE_RENDITION = /^video-renditions\/[0-9a-f-]{16,64}\.mobile\.mp4$/i;
const INPUT = /^video-inputs\/[0-9a-f-]{16,64}\.dataurl$/i;
const JOB = /^[0-9a-f-]{16,64}$/i;
type Client = Pick<COS, "putObject" | "deleteObject" | "getObject" | "headObject">;
export type TencentCosVideoArtifactStorageOptions = { secretId: string; secretKey: string; bucket: string; region: string; signingSecret: string; playbackBaseUrl: string; aiContentMarker?: AiContentMarker; downloader: Pick<SecureVideoDownloader, "download"> };

function key(value: string): void { if (!OUTPUT.test(value) && !MOBILE_RENDITION.test(value) && !INPUT.test(value)) throw new Error("VIDEO_ARTIFACT_INVALID_KEY"); }
function job(value: string): void { if (!JOB.test(value)) throw new Error("VIDEO_ARTIFACT_INVALID_JOB_ID"); }
function dataUrl(value: string): void { if (!/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(value)) throw new Error("VIDEO_ARTIFACT_INPUT_INVALID"); }
function mobileRenditionKey(artifactKey: string): string { if (!OUTPUT.test(artifactKey)) throw new Error("VIDEO_ARTIFACT_INVALID_KEY"); return artifactKey.replace(/^video-artifacts\//i, "video-renditions/").replace(/\.mp4$/i, ".mobile.mp4"); }

export class TencentCosVideoArtifactStorage implements VideoArtifactStoragePort {
  private readonly secret: Buffer;
  private readonly client: Client;
  constructor(private readonly options: TencentCosVideoArtifactStorageOptions, client?: Client) { this.secret = Buffer.from(options.signingSecret, "utf8"); if (this.secret.byteLength < 48) throw new Error("VIDEO_ARTIFACT_SIGNING_SECRET_WEAK"); this.client = client ?? new COS({ SecretId: options.secretId, SecretKey: options.secretKey }); }
  async stageInput(input: { jobId: string; imageDataUrl: string }): Promise<void> { job(input.jobId); dataUrl(input.imageDataUrl); await this.write(`video-inputs/${input.jobId}.dataurl`, Buffer.from(input.imageDataUrl)); }
  async readInput(input: { jobId: string }): Promise<string> { job(input.jobId); const value = (await this.read(`video-inputs/${input.jobId}.dataurl`)).toString("utf8"); dataUrl(value); return value; }
  async deleteInput(input: { jobId: string }): Promise<void> { job(input.jobId); await this.remove(`video-inputs/${input.jobId}.dataurl`); }
  async download(input: { url: string; jobId: string }): Promise<StagedVideoArtifact> { job(input.jobId); const value = await this.options.downloader.download(input); return { artifactKey: `video-artifacts/${input.jobId}.mp4`, body: value.body, contentType: value.contentType }; }
  async stageArtifact(input: { jobId: string; body: Buffer; contentType: string | null }): Promise<StagedVideoArtifact> { job(input.jobId); if (!input.body.length) throw new Error("VIDEO_ARTIFACT_EMPTY"); const body = this.options.aiContentMarker ? await this.options.aiContentMarker.markMp4({ body: input.body, contentId: input.jobId }) : input.body; const artifactKey = `video-artifacts/${input.jobId}.mp4`; await this.write(artifactKey, body); return { artifactKey, body, contentType: input.contentType }; }
  async deleteArtifact(input: { artifactKey: string }): Promise<void> { if (!OUTPUT.test(input.artifactKey)) throw new Error("VIDEO_ARTIFACT_INVALID_KEY"); await this.remove(input.artifactKey); await this.remove(mobileRenditionKey(input.artifactKey)); }
  async createSignedPlaybackUrl(input: { artifactKey: string; expiresInSeconds: number }): Promise<{ url: string; expiresAt: string }> { if (!OUTPUT.test(input.artifactKey) || !Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 1 || input.expiresInSeconds > 900) throw new Error("VIDEO_ARTIFACT_SIGNING_INPUT_INVALID"); const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(); const url = new URL(this.options.playbackBaseUrl); url.searchParams.set("artifactKey", input.artifactKey); url.searchParams.set("expiresAt", expiresAt); url.searchParams.set("signature", this.signature(input.artifactKey, expiresAt)); return { url: url.toString(), expiresAt }; }
  async readArtifact(input: { artifactKey: string }): Promise<Buffer> { if (!OUTPUT.test(input.artifactKey)) throw new Error("VIDEO_ARTIFACT_INVALID_KEY"); return this.read(input.artifactKey); }
  async readArtifactRange(input: { artifactKey: string; start?: number; end?: number; rendition?: VideoPlaybackRendition }): Promise<{ body: Buffer; contentType: string; totalBytes: number }> {
    if (!OUTPUT.test(input.artifactKey)) throw new Error("VIDEO_ARTIFACT_INVALID_KEY");
    const read = async (key: string) => { const head = await this.client.headObject({ Bucket: this.options.bucket, Region: this.options.region, Key: key }); const totalBytes = Number(head.headers?.["content-length"]); const start = input.start ?? 0, end = input.end ?? totalBytes - 1; if (!Number.isSafeInteger(totalBytes) || totalBytes < 1 || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= totalBytes) throw new Error("VIDEO_ARTIFACT_INVALID_RANGE"); const result = await this.client.getObject({ Bucket: this.options.bucket, Region: this.options.region, Key: key, Range: `bytes=${start}-${end}` }); return { body: result.Body, contentType: "video/mp4", totalBytes }; };
    if (input.rendition !== "mobile") return read(input.artifactKey);
    try { return await read(mobileRenditionKey(input.artifactKey)); } catch { return read(input.artifactKey); }
  }
  verifySignedPlayback(input: { artifactKey: string; expiresAt: string; signature: string }): boolean { if (!OUTPUT.test(input.artifactKey) || !Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) < Date.now()) return false; const expected = Buffer.from(this.signature(input.artifactKey, input.expiresAt)); const actual = Buffer.from(input.signature); return expected.length === actual.length && timingSafeEqual(expected, actual); }
  private signature(artifactKey: string, expiresAt: string): string { return createHmac("sha256", this.secret).update(`${artifactKey}\n${expiresAt}`).digest("base64url"); }
  private async write(value: string, body: Buffer): Promise<void> { key(value); await this.client.putObject({ Bucket: this.options.bucket, Region: this.options.region, Key: value, Body: body, ContentLength: body.length, ContentType: value.endsWith(".mp4") ? "video/mp4" : "text/plain", Headers: { "x-cos-meta-sha256": createHash("sha256").update(body).digest("hex") } }); }
  private async read(value: string): Promise<Buffer> { key(value); return (await this.client.getObject({ Bucket: this.options.bucket, Region: this.options.region, Key: value })).Body; }
  private async remove(value: string): Promise<void> { key(value); await this.client.deleteObject({ Bucket: this.options.bucket, Region: this.options.region, Key: value }); }
}
