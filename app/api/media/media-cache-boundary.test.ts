import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mediaError, mediaJson } from "./_lib";

test("media API JSON responses are private and cannot be shared-cached", async () => {
  const response = mediaJson({ signedUrl: "sensitive-capability" });
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("vary"), "Cookie, Origin");

  const failed = mediaError(new Error("unexpected"));
  assert.equal(failed.status, 500);
  assert.equal(failed.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("owned media read, delete, and upload paths cannot bypass the no-store helper", () => {
  const mediaItem = readFileSync(new URL("./[id]/route.ts", import.meta.url), "utf8");
  const upload = readFileSync(new URL("./upload/_handler.ts", import.meta.url), "utf8");
  assert.match(mediaItem, /mediaJson/);
  assert.match(upload, /mediaJson/);
  assert.doesNotMatch(mediaItem, /NextResponse\.json/);
  assert.doesNotMatch(upload, /NextResponse\.json/);
});
