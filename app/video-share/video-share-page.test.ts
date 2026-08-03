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
  assert.match(client, /\/api\/video-shares\//);
  assert.match(client, /12_000/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /role="alert"/);
  assert.doesNotMatch(client, /\/share\//);
});
