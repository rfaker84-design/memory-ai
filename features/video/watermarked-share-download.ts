import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { VideoArtifactStoragePort } from "./video-artifact-storage";

const execFileAsync = promisify(execFile);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OwnerWatermarkedVideoCandidate = {
  publicId: string;
  memoryId: string;
  jobId: string;
  artifactKey: string;
};

export type OwnerWatermarkedVideoLookup = {
  findWatermarkedDownloadForOwner(input: { externalUserId: string; memoryId: string; publicId: string }): Promise<OwnerWatermarkedVideoCandidate | null>;
  recordWatermarkedDownload(input: { externalUserId: string; memoryId: string; publicId: string; sha256: string; byteLength: number }): Promise<boolean>;
};

export type WatermarkedVideoRenderer = {
  render(input: { body: Buffer; contentId: string }): Promise<Buffer>;
};

export class WatermarkedShareDownloadError extends Error {
  constructor(readonly code: "SHARE_DOWNLOAD_NOT_AVAILABLE" | "SHARE_DOWNLOAD_RENDER_FAILED" | "SHARE_DOWNLOAD_AUDIT_FAILED") {
    super(code);
    this.name = "WatermarkedShareDownloadError";
  }
}

/**
 * Renders the Owner's requested derivative only in a private temporary
 * directory. It has no object-storage key, so account deletion has no second
 * durable media object to discover; the directory is removed in finally on
 * both success and failure. A failed ffmpeg execution never returns bytes.
 */
export class FfmpegWatermarkedVideoRenderer implements WatermarkedVideoRenderer {
  constructor(private readonly options: { ffmpegPath?: string } = {}) {}

  async render(input: { body: Buffer; contentId: string }): Promise<Buffer> {
    if (input.body.byteLength === 0 || !UUID.test(input.contentId)) {
      throw new WatermarkedShareDownloadError("SHARE_DOWNLOAD_RENDER_FAILED");
    }
    const directory = await mkdtemp(path.join(tmpdir(), "memoryai-watermarked-share-"));
    const source = path.join(directory, `${randomUUID()}.source.mp4`);
    const output = path.join(directory, `${randomUUID()}.watermarked.mp4`);
    try {
      await writeFile(source, input.body, { flag: "wx" });
      await execFileAsync(this.options.ffmpegPath ?? "ffmpeg", [
        "-y", "-hide_banner", "-loglevel", "error", "-i", source,
        "-map", "0:v:0", "-map", "0:a?",
        "-vf", "drawtext=text='AI Generated | MemoryAI':x=w-tw-24:y=h-th-24:fontsize=28:fontcolor=white@0.95:box=1:boxcolor=black@0.5:boxborderw=10",
        "-c:v", "libx264", "-crf", "20", "-c:a", "copy", "-map_metadata", "-1",
        "-metadata", "title=AI generated memorial video | MemoryAI",
        "-movflags", "+faststart", output,
      ], { timeout: 120_000, maxBuffer: 1024 * 1024 });
      const rendered = await readFile(output);
      if (rendered.byteLength === 0) throw new Error("empty output");
      return rendered;
    } catch (error) {
      if (error instanceof WatermarkedShareDownloadError) throw error;
      throw new WatermarkedShareDownloadError("SHARE_DOWNLOAD_RENDER_FAILED");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export class OwnerWatermarkedShareDownloadService {
  constructor(
    private readonly lookup: OwnerWatermarkedVideoLookup,
    private readonly artifacts: Pick<VideoArtifactStoragePort, "readArtifact">,
    private readonly renderer: WatermarkedVideoRenderer,
  ) {}

  async prepare(input: { externalUserId: string; memoryId: string; publicId: string }): Promise<{ body: Buffer; fileName: string }> {
    const candidate = await this.lookup.findWatermarkedDownloadForOwner(input);
    if (!candidate) throw new WatermarkedShareDownloadError("SHARE_DOWNLOAD_NOT_AVAILABLE");
    const source = await this.artifacts.readArtifact({ artifactKey: candidate.artifactKey });
    const body = await this.renderer.render({ body: source, contentId: candidate.jobId });
    if (body.byteLength === 0) throw new WatermarkedShareDownloadError("SHARE_DOWNLOAD_RENDER_FAILED");
    const recorded = await this.lookup.recordWatermarkedDownload({
      ...input,
      sha256: createHash("sha256").update(body).digest("hex"),
      byteLength: body.byteLength,
    });
    if (!recorded) throw new WatermarkedShareDownloadError("SHARE_DOWNLOAD_AUDIT_FAILED");
    return { body, fileName: `memoryai-watermarked-${candidate.publicId}.mp4` };
  }
}
