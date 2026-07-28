import { execFile } from "node:child_process";
import { promises as dns } from "node:dns";
import { mkdir, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { promisify } from "node:util";

import type { FirstPresenceMediaProbe } from "./first-presence-quality-gate";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 3;

export type SecureVideoDownload = {
  artifactKey: string;
  body: Buffer;
  contentType: string | null;
  finalUrl: string;
};

export type SecureVideoDownloaderOptions = {
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  maxBytes?: number;
  timeoutMs?: number;
};

export class VideoDownloadSecurityError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function isBlockedIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 ||
      a === 192 && b === 168 ||
      a === 100 && b >= 64 && b <= 127 ||
      a === 192 && b === 0 ||
      a === 198 && (b === 18 || b === 19) ||
      a >= 224
    );
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("ff")
    );
  }
  return true;
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function validateHttpsUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new VideoDownloadSecurityError("VIDEO_URL_INVALID");
  }
  if (parsed.protocol !== "https:") {
    throw new VideoDownloadSecurityError("VIDEO_URL_NOT_HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new VideoDownloadSecurityError("VIDEO_URL_CREDENTIALS_FORBIDDEN");
  }
  return parsed;
}

export class SecureVideoDownloader {
  private readonly fetchImpl: typeof fetch;
  private readonly resolveHost: (hostname: string) => Promise<string[]>;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;

  constructor(options: SecureVideoDownloaderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.resolveHost = options.resolveHost ?? defaultResolveHost;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async download(input: { url: string; jobId: string }): Promise<SecureVideoDownload> {
    let current = validateHttpsUrl(input.url);
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      await this.assertPublicDestination(current);
      const response = await this.fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new VideoDownloadSecurityError("VIDEO_REDIRECT_WITHOUT_LOCATION");
        current = validateHttpsUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) {
        throw new VideoDownloadSecurityError(`VIDEO_DOWNLOAD_HTTP_${response.status}`);
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > this.maxBytes) {
        throw new VideoDownloadSecurityError("VIDEO_TOO_LARGE");
      }
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length === 0 || body.length > this.maxBytes) {
        throw new VideoDownloadSecurityError("VIDEO_SIZE_INVALID");
      }
      return {
        artifactKey: `first-presence/${input.jobId}.mp4`,
        body,
        contentType: response.headers.get("content-type"),
        finalUrl: current.toString(),
      };
    }
    throw new VideoDownloadSecurityError("VIDEO_REDIRECT_LIMIT_EXCEEDED");
  }

  private async assertPublicDestination(url: URL): Promise<void> {
    const addresses = await this.resolveHost(url.hostname);
    if (addresses.length === 0 || addresses.some(isBlockedIp)) {
      throw new VideoDownloadSecurityError("VIDEO_URL_PRIVATE_ADDRESS");
    }
  }
}

export type FfmpegFirstPresenceMediaInspectorOptions = {
  ffprobePath?: string;
  ffmpegPath?: string;
  evidenceRoot: string;
};

export class FfmpegFirstPresenceMediaInspector {
  constructor(private readonly options: FfmpegFirstPresenceMediaInspectorOptions) {}

  async inspect(input: { artifactKey: string; body: Buffer }): Promise<FirstPresenceMediaProbe> {
    const safeName = input.artifactKey.replace(/[^A-Za-z0-9._-]/g, "_");
    const evidenceDirectory = path.join(this.options.evidenceRoot, safeName);
    await mkdir(evidenceDirectory, { recursive: true });
    const videoPath = path.join(evidenceDirectory, "source.mp4");
    await writeFile(videoPath, input.body);

    const probe = await this.ffprobe(videoPath);
    const duration = Number.isFinite(probe.durationSeconds)
      ? Math.max(0, probe.durationSeconds)
      : 0;
    const actionTimestamp = Math.min(4, Math.max(0, duration / 2));
    const finalTimestamp = Math.max(0, duration - 0.1);
    await this.ffmpeg(videoPath, path.join(evidenceDirectory, "first.jpg"), "0");
    await this.ffmpeg(
      videoPath,
      path.join(evidenceDirectory, "action.jpg"),
      actionTimestamp.toFixed(3)
    );
    await this.ffmpeg(
      videoPath,
      path.join(evidenceDirectory, "final.jpg"),
      finalTimestamp.toFixed(3)
    );

    return {
      ...probe,
      sizeBytes: input.body.length,
      decodable: true,
      evidence: {
        firstFramePath: path.join(evidenceDirectory, "first.jpg"),
        actionFramePath: path.join(evidenceDirectory, "action.jpg"),
        finalFramePath: path.join(evidenceDirectory, "final.jpg"),
      },
    };
  }

  private async ffprobe(videoPath: string): Promise<Omit<FirstPresenceMediaProbe, "sizeBytes" | "decodable" | "evidence">> {
    const { stdout } = await execFileAsync(this.options.ffprobePath ?? "ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_name,codec_type,width,height",
      "-of",
      "json",
      videoPath,
    ]);
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_name?: string;
        codec_type?: string;
        width?: number;
        height?: number;
      }>;
    };
    const streams = parsed.streams ?? [];
    const video = streams.find((stream) => stream.codec_type === "video");
    return {
      durationSeconds: Number(parsed.format?.duration),
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      codec: video?.codec_name ?? "",
      hasAudio: streams.some((stream) => stream.codec_type === "audio"),
    };
  }

  private async ffmpeg(videoPath: string, framePath: string, timestamp: string): Promise<void> {
    await execFileAsync(this.options.ffmpegPath ?? "ffmpeg", [
      "-y",
      "-ss",
      timestamp,
      "-i",
      videoPath,
      "-frames:v",
      "1",
      framePath,
    ]);
  }
}
