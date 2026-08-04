import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("mobile video sharing uses Owner-bound formal APIs and excludes first previews", () => {
  assert.match(api, /listVideoShares\(memoryId: string\)[\s\S]*?\/video-shares/);
  assert.match(api, /createVideoShare\(memoryId: string, jobId: string, title: string\)[\s\S]*?method: "POST"/);
  assert.match(api, /revokeVideoShare\(memoryId: string, publicId: string\)[\s\S]*?method: "DELETE"/);
  assert.match(api, /setVideoShareWatermarkDownload\(memoryId: string, publicId: string, enabled: boolean\)[\s\S]*?method: "PATCH"/);
  assert.match(api, /downloadWatermarkedVideoShare\(memoryId: string, publicId: string\)[\s\S]*?\/download/);
  assert.match(app, /仅 Owner 可选择生成带/);
  assert.match(app, /URL\.createObjectURL\(blob\)/);
  assert.match(app, /job\.status === "succeeded" && job\.saveAllowed && job\.artifactAvailable && !job\.manualReviewRequired/);
  assert.match(app, /runtimeConfig\.appOrigin}\/video-share\/\$\{share\.publicId\}/);
  assert.doesNotMatch(app, /providerTaskId|artifactKey|storage_key/);
});
