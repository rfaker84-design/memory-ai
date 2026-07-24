import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const flow = readFileSync("src/components/first-presence/FirstPresenceFlow.tsx", "utf8");

test("visual preview keeps a local portrait through greeting and the two-turn conversation", () => {
  assert.match(flow, /TA 的照片（仅本次预览）/);
  assert.match(flow, /setPortraitUrl\(file \? URL\.createObjectURL\(file\) : null\)/);
  assert.match(flow, /stage === "preview-greeting"[\s\S]*?继续聊聊/);
  assert.match(flow, /stage === "preview-chat"[\s\S]*?MemoryAvatar image=\{portraitUrl\}/);
  assert.match(flow, /49元 · 30天 · 1个 TA · 100次 AI 回复/);
});

test("visual preview stays behind an explicit non-production flag and has no write request", () => {
  assert.match(flow, /process\.env\.NODE_ENV !== "production" && process\.env\.NEXT_PUBLIC_MEMORYAI_ENABLE_PRESENCE_PREVIEW === "true"/);
  const preview = flow.match(/const createPreview[\s\S]*?const retryPreviewGeneration/)?.[0] ?? "";
  assert.doesNotMatch(preview, /fetch\(/);
});
