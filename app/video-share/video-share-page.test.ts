import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public video share page is noindex, view-only and does not use legacy sharing", () => {
  const page = readFileSync("app/video-share/[publicId]/page.tsx", "utf8");
  const client = readFileSync("app/video-share/[publicId]/ShareVideoClient.tsx", "utf8");
  assert.match(page, /index: false/);
  assert.match(page, /follow: false/);
  assert.match(client, /controlsList="nodownload noremoteplayback"/);
  assert.match(client, /AI 生成纪念影像/);
  assert.match(client, /data-ai-generated-overlay="true"/);
  assert.match(client, /data-memoryai-logo="true"/);
  assert.match(client, /aria-label="忆见 Logo"/);
  assert.match(client, /pointerEvents: "none"/);
  assert.match(client, /\/api\/video-shares\//);
  assert.match(client, /12_000/);
  assert.match(client, /globalThis\.setTimeout\(\(\) => \{\s*controller\.abort\(\);\s*setState\("unavailable"\);\s*\}, 12_000\)/);
  assert.match(client, /publicShare=/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /role="alert"/);
  assert.doesNotMatch(client, /\/share\//);
});

test("public video shares offer a not-like-TA review path without claiming automatic content mutation", () => {
  const client = readFileSync("app/video-share/[publicId]/ShareVideoClient.tsx", "utf8");
  assert.match(client, /reason=not_like_ta/);
  assert.match(client, /这不像TA/);
  assert.match(client, /投诉或举报此分享/);
  assert.doesNotMatch(client, /自动.*下架|自动.*删除|自动.*重生成/);
});
