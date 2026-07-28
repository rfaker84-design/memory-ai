import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveStagingMediaPath, StagingLocalMediaStorage } from "./staging-local-media-storage";

test("staging local media writes only inside its isolated root", async () => {
  const root = await mkdtemp(join(tmpdir(), "memoryai-staging-media-"));
  const key = "media/phone:test/11111111-1111-4111-8111-111111111111/image/22222222-2222-4222-8222-222222222222.jpg";
  try {
    const storage = new StagingLocalMediaStorage(root);
    await storage.put({ key, body: Buffer.from("isolated"), contentType: "image/jpeg", contentLength: 8, sha256: "x" });
    assert.equal((await storage.read(key)).toString(), "isolated");
    assert.throws(() => resolveStagingMediaPath(root, "../production-media.jpg"), /STAGING_MEDIA_PATH_INVALID/);
    await storage.delete(key);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
