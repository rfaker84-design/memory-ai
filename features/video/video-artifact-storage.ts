import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { SecureVideoDownloader } from "./first-presence-media-inspection";

const JOB_ID = /^[0-9a-f-]{16,64}$/i;
const OUTPUT_KEY = /^video-artifacts\/[0-9a-f-]{16,64}\.mp4$/i;
const INPUT_KEY = /^video-inputs\/[0-9a-f-]{16,64}\.dataurl$/i;

export type StagedVideoArtifact = {
  artifactKey: string;
  body: Buffer;
  contentType: string | null;
};

export type VideoArtifactStoragePort = {
  stageInput(input: { jobId: string; imageDataUrl: string }): Promise<void>;
  readInput(input: { jobId: string }): Promise<string>;
  deleteInput(input: { jobId: string }): Promise<void>;
  download(input: { url: string; jobId: string }): Promise<StagedVideoArtifact>;
  stageArtifact(input: { jobId: string; body: Buffer; contentType: string | null }): Promise<StagedVideoArtifact>;
  deleteArtifact(input: { artifactKey: string }): Promise<void>;
  createSignedPlaybackUrl(input: { artifactKey: string; expiresInSeconds: number }): Promise<{ url: string; expiresAt: string }>;
  readArtifact(input: { artifactKey: string }): Promise<Buffer>;
  verifySignedPlayback(input: { artifactKey: string; expiresAt: string; signature: string }): boolean;
};

export type LocalStagingVideoArtifactStorageOptions = {
  root: string;
  signingSecret: string;
  playbackBaseUrl: string;
  downloader?: Pick<SecureVideoDownloader, "download">;
};

function assertJobId(jobId: string): void {
  if (!JOB_ID.test(jobId)) throw new Error("VIDEO_ARTIFACT_INVALID_JOB_ID");
}

function assertKey(key: string): void {
  if (!OUTPUT_KEY.test(key) && !INPUT_KEY.test(key)) {
    throw new Error("VIDEO_ARTIFACT_INVALID_KEY");
  }
}

function safeRoot(root: string): string {
  if (!isAbsolute(root)) throw new Error("VIDEO_ARTIFACT_STORAGE_UNAVAILABLE");
  return resolve(root);
}

function dataUrlContentType(value: string): string {
  const match = /^data:([^;,]+);base64,[A-Za-z0-9+/=]+$/.exec(value);
  if (!match) throw new Error("VIDEO_ARTIFACT_INPUT_INVALID");
  return match[1];
}

/**
 * Non-production-only private staging store. It deliberately has no COS
 * fallback: production remains fail-closed until a reviewed artifact provider
 * is introduced.
 */
export class LocalStagingVideoArtifactStorage implements VideoArtifactStoragePort {
  private readonly root: string;
  private readonly secret: Buffer;
  private readonly playbackBaseUrl: URL;
  private readonly downloader: Pick<SecureVideoDownloader, "download">;

  constructor(options: LocalStagingVideoArtifactStorageOptions) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("VIDEO_ARTIFACT_STORAGE_UNAVAILABLE");
    }
    if (Buffer.byteLength(options.signingSecret, "utf8") < 48) {
      throw new Error("VIDEO_ARTIFACT_SIGNING_SECRET_WEAK");
    }
    this.root = safeRoot(options.root);
    this.secret = Buffer.from(options.signingSecret, "utf8");
    this.playbackBaseUrl = new URL(options.playbackBaseUrl);
    this.downloader = options.downloader ?? new SecureVideoDownloader();
  }

  async stageInput(input: { jobId: string; imageDataUrl: string }): Promise<void> {
    assertJobId(input.jobId);
    dataUrlContentType(input.imageDataUrl);
    await this.writeIdempotent(`video-inputs/${input.jobId}.dataurl`, Buffer.from(input.imageDataUrl, "utf8"));
  }

  async readInput(input: { jobId: string }): Promise<string> {
    assertJobId(input.jobId);
    const value = (await this.read(`video-inputs/${input.jobId}.dataurl`)).toString("utf8");
    dataUrlContentType(value);
    return value;
  }

  deleteInput(input: { jobId: string }): Promise<void> {
    assertJobId(input.jobId);
    return this.remove(`video-inputs/${input.jobId}.dataurl`);
  }

  async download(input: { url: string; jobId: string }): Promise<StagedVideoArtifact> {
    const downloaded = await this.downloader.download(input);
    return { artifactKey: `video-artifacts/${input.jobId}.mp4`, body: downloaded.body, contentType: downloaded.contentType };
  }

  async stageArtifact(input: { jobId: string; body: Buffer; contentType: string | null }): Promise<StagedVideoArtifact> {
    assertJobId(input.jobId);
    if (input.body.length === 0) throw new Error("VIDEO_ARTIFACT_EMPTY");
    const artifactKey = `video-artifacts/${input.jobId}.mp4`;
    await this.writeIdempotent(artifactKey, input.body);
    return { artifactKey, body: input.body, contentType: input.contentType };
  }

  deleteArtifact(input: { artifactKey: string }): Promise<void> {
    if (!OUTPUT_KEY.test(input.artifactKey)) throw new Error("VIDEO_ARTIFACT_INVALID_KEY");
    return this.remove(input.artifactKey);
  }

  async createSignedPlaybackUrl(input: { artifactKey: string; expiresInSeconds: number }): Promise<{ url: string; expiresAt: string }> {
    if (!OUTPUT_KEY.test(input.artifactKey) || !Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 1 || input.expiresInSeconds > 900) {
      throw new Error("VIDEO_ARTIFACT_SIGNING_INPUT_INVALID");
    }
    await this.read(input.artifactKey);
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();
    const url = new URL(this.playbackBaseUrl);
    url.searchParams.set("artifactKey", input.artifactKey);
    url.searchParams.set("expiresAt", expiresAt);
    url.searchParams.set("signature", this.signature(input.artifactKey, expiresAt));
    return { url: url.toString(), expiresAt };
  }

  readArtifact(input: { artifactKey: string }): Promise<Buffer> {
    if (!OUTPUT_KEY.test(input.artifactKey)) throw new Error("VIDEO_ARTIFACT_INVALID_KEY");
    return this.read(input.artifactKey);
  }

  verifySignedPlayback(input: { artifactKey: string; expiresAt: string; signature: string }): boolean {
    if (!OUTPUT_KEY.test(input.artifactKey) || Number.isNaN(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) < Date.now()) return false;
    const expected = Buffer.from(this.signature(input.artifactKey, input.expiresAt));
    const actual = Buffer.from(input.signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private signature(artifactKey: string, expiresAt: string): string {
    return createHmac("sha256", this.secret).update(`${artifactKey}\n${expiresAt}`).digest("base64url");
  }

  private pathFor(key: string): string {
    assertKey(key);
    const target = resolve(this.root, ...key.split("/"));
    const child = relative(this.root, target);
    if (!child || child.startsWith("..") || isAbsolute(child)) throw new Error("VIDEO_ARTIFACT_INVALID_KEY");
    return target;
  }

  private async writeIdempotent(key: string, body: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(resolve(target, ".."), { recursive: true });
    try {
      await writeFile(target, body, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await readFile(target);
      if (!createHash("sha256").update(existing).digest().equals(createHash("sha256").update(body).digest())) {
        throw new Error("VIDEO_ARTIFACT_IDEMPOTENCY_CONFLICT");
      }
    }
  }

  private read(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  private async remove(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function createVideoArtifactStorageFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): VideoArtifactStoragePort {
  if (environment.NODE_ENV === "production" || environment.VIDEO_ARTIFACT_STORAGE_PROVIDER !== "local-staging") {
    throw new Error("VIDEO_ARTIFACT_STORAGE_UNAVAILABLE");
  }
  const root = environment.VIDEO_ARTIFACT_STAGING_ROOT;
  const signingSecret = environment.VIDEO_ARTIFACT_SIGNING_SECRET;
  const playbackBaseUrl = environment.VIDEO_ARTIFACT_PLAYBACK_BASE_URL;
  if (!root || !signingSecret || !playbackBaseUrl) throw new Error("VIDEO_ARTIFACT_STORAGE_UNAVAILABLE");
  return new LocalStagingVideoArtifactStorage({ root, signingSecret, playbackBaseUrl });
}
