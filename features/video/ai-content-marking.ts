import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const CONTENT_ID = /^[0-9a-f-]{16,64}$/i;

export const AI_GENERATED_CONTENT_NOTICE = "AI 生成内容，不代表真实人物或其真实表达";

export class AiContentMarkingError extends Error {
  constructor(readonly code: "AI_CONTENT_MARKING_INPUT_INVALID" | "AI_CONTENT_MARKING_FAILED") {
    super(code);
    this.name = "AiContentMarkingError";
  }
}

export type AiContentMarker = {
  markMp4(input: { body: Buffer; contentId: string }): Promise<Buffer>;
};

/**
 * Writes only generation provenance into the MP4 container. The content id is
 * the durable video-job id, never a user, memory, telephone, or object key.
 * This is the file-level counterpart to the visible in-product disclosure.
 */
export class FfmpegAiContentMarker implements AiContentMarker {
  constructor(
    private readonly options: {
      providerName: string;
      providerCode: string;
      ffmpegPath?: string;
    },
  ) {}

  async markMp4(input: { body: Buffer; contentId: string }): Promise<Buffer> {
    if (input.body.byteLength === 0 || !CONTENT_ID.test(input.contentId)) {
      throw new AiContentMarkingError("AI_CONTENT_MARKING_INPUT_INVALID");
    }
    const directory = await mkdtemp(path.join(tmpdir(), "memoryai-ai-mark-"));
    const source = path.join(directory, `${randomUUID()}.source.mp4`);
    const output = path.join(directory, `${randomUUID()}.marked.mp4`);
    try {
      await writeFile(source, input.body, { flag: "wx" });
      const provenance = [
        "ai_generated=true",
        `service_provider=${this.options.providerName}`,
        `service_provider_code=${this.options.providerCode}`,
        `content_id=${input.contentId}`,
      ].join(";");
      await execFileAsync(this.options.ffmpegPath ?? "ffmpeg", [
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", source,
        "-map", "0", "-c", "copy", "-map_metadata", "-1",
        "-metadata", `title=${AI_GENERATED_CONTENT_NOTICE}`,
        "-metadata", `description=${AI_GENERATED_CONTENT_NOTICE}`,
        "-metadata", `comment=${provenance}`,
        "-metadata", `artist=${this.options.providerName}`,
        "-movflags", "+faststart",
        output,
      ], { timeout: 60_000, maxBuffer: 1024 * 1024 });
      const marked = await readFile(output);
      if (marked.byteLength === 0) throw new Error("empty output");
      return marked;
    } catch (error) {
      if (error instanceof AiContentMarkingError) throw error;
      throw new AiContentMarkingError("AI_CONTENT_MARKING_FAILED");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export function aiGeneratedPlaybackHeaders(contentId: string): Readonly<Record<string, string>> {
  if (!CONTENT_ID.test(contentId)) throw new AiContentMarkingError("AI_CONTENT_MARKING_INPUT_INVALID");
  return Object.freeze({
    "X-AI-Generated-Content": "true",
    "X-AI-Content-Id": contentId,
    "X-Content-Disclosure": "ai-generated",
  });
}
