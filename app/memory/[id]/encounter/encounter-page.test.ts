import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("first encounter keeps a visible, non-interactive AI disclosure over playable video", () => {
  const page = readFileSync("app/memory/[id]/encounter/page.tsx", "utf8");
  assert.match(page, /data-ai-generated-overlay="true"/);
  assert.match(page, /AI 生成纪念影像/);
  assert.match(page, /pointerEvents: "none"/);
  assert.match(page, /controlsList="nodownload noremoteplayback"/);
});
