import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  AI_GENERATED_CONTENT_NOTICE,
  AiContentMarkingError,
  FfmpegAiContentMarker,
  aiGeneratedPlaybackHeaders,
} from "./ai-content-marking";

const execFileAsync = promisify(execFile);
const contentId = "00000000-0000-4000-8000-000000000031";

test("AI-generated MP4 artifacts carry a non-identifying implicit provenance marker", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "memoryai-ai-mark-test-"));
  const source = path.join(directory, "source.mp4");
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=black:s=320x240:d=1",
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", source,
    ]);
    const marked = await new FfmpegAiContentMarker({
      providerName: "MemoryAI Staging",
      providerCode: "memoryai-staging",
    }).markMp4({ body: await readFile(source), contentId });
    const output = path.join(directory, "marked.mp4");
    await writeFile(output, marked, { flag: "wx" });
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format_tags", "-of", "json", output,
    ]);
    const tags = JSON.parse(stdout) as { format?: { tags?: Record<string, string> } };
    assert.equal(tags.format?.tags?.title, AI_GENERATED_CONTENT_NOTICE);
    assert.match(tags.format?.tags?.comment ?? "", /ai_generated=true/);
    assert.match(tags.format?.tags?.comment ?? "", new RegExp(`content_id=${contentId}`));
    assert.doesNotMatch(tags.format?.tags?.comment ?? "", /owner_id|memory_id|phone|artifact_key|object_key/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("AI content markers reject invalid ids and playback keeps a visible protocol disclosure", async () => {
  const marker = new FfmpegAiContentMarker({ providerName: "MemoryAI", providerCode: "memoryai" });
  await assert.rejects(
    marker.markMp4({ body: Buffer.from("not-a-video"), contentId: "owner:private" }),
    (error: unknown) => error instanceof AiContentMarkingError && error.code === "AI_CONTENT_MARKING_INPUT_INVALID",
  );
  assert.deepEqual(aiGeneratedPlaybackHeaders(contentId), {
    "X-AI-Generated-Content": "true",
    "X-AI-Content-Id": contentId,
    "X-Content-Disclosure": "ai-generated",
  });
});
