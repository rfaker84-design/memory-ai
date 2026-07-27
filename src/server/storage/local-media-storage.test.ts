import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMediaStorage } from "./index";
import { LocalMediaStorage } from "./local-media-storage";

test("local media storage persists, serves, and deletes isolated files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "memoryai-local-media-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalMediaStorage({ root });
  const body = Buffer.from(`local-media-${randomUUID()}`);
  const sha256 = createHash("sha256").update(body).digest("hex");
  const key = "media/test-user/test-memory/image/example.png";

  assert.deepEqual(await storage.put({
    key,
    body,
    contentType: "image/png",
    contentLength: body.byteLength,
    sha256,
  }), { key, etag: sha256 });
  assert.deepEqual(await readFile(join(root, ...key.split("/"))), body);
  assert.equal(
    await storage.createSignedDownloadUrl(key, 60),
    `data:image/png;base64,${body.toString("base64")}`,
  );
  await storage.delete(key);
  await assert.rejects(readFile(join(root, ...key.split("/"))), { code: "ENOENT" });
});

test("local media storage rejects traversal and relative roots", async () => {
  assert.throws(
    () => new LocalMediaStorage({ root: "relative-root" }),
    /MEDIA_LOCAL_ROOT/,
  );
  const storage = new LocalMediaStorage({ root: join(tmpdir(), "memoryai-local-media-safe") });
  await assert.rejects(
    storage.put({
      key: "../../outside.png",
      body: Buffer.from("x"),
      contentType: "image/png",
      contentLength: 1,
      sha256: createHash("sha256").update("x").digest("hex"),
    }),
    /STORAGE_INVALID_KEY/,
  );
  assert.throws(
    () => new LocalMediaStorage({ root: join(tmpdir(), "..", "outside-local-media") }),
    /MEDIA_LOCAL_ROOT/,
  );
});

test("local media storage accepts a Windows long temporary path when tmpdir uses its short alias", async (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows-specific temporary path canonicalization");
    return;
  }
  const root = await mkdtemp(join(await realpath(tmpdir()), "memoryai-local-media-windows-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.doesNotThrow(() => new LocalMediaStorage({ root }));
});

test("local media storage cannot be selected in production", () => {
  const environment = process.env as Record<string, string | undefined>;
  const original = {
    nodeEnv: environment.NODE_ENV,
    provider: environment.MEDIA_STORAGE_PROVIDER,
    root: environment.MEDIA_LOCAL_ROOT,
  };
  try {
    environment.NODE_ENV = "production";
    environment.MEDIA_STORAGE_PROVIDER = "local";
    environment.MEDIA_LOCAL_ROOT = join(tmpdir(), "memoryai-local-media-production");
    assert.throws(
      () => createMediaStorage(),
      /MEDIA_STORAGE_PROVIDER/,
    );
  } finally {
    if (original.nodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = original.nodeEnv;
    if (original.provider === undefined) delete environment.MEDIA_STORAGE_PROVIDER;
    else environment.MEDIA_STORAGE_PROVIDER = original.provider;
    if (original.root === undefined) delete environment.MEDIA_LOCAL_ROOT;
    else environment.MEDIA_LOCAL_ROOT = original.root;
  }
});

test("local media storage is available only in explicit development or test mode", () => {
  const environment = process.env as Record<string, string | undefined>;
  const original = {
    nodeEnv: environment.NODE_ENV,
    provider: environment.MEDIA_STORAGE_PROVIDER,
    root: environment.MEDIA_LOCAL_ROOT,
  };
  try {
    environment.MEDIA_STORAGE_PROVIDER = "local";
    environment.MEDIA_LOCAL_ROOT = join(tmpdir(), "memoryai-local-media-mode-test");
    environment.NODE_ENV = "development";
    assert.ok(createMediaStorage() instanceof LocalMediaStorage);
    environment.NODE_ENV = "staging";
    assert.throws(() => createMediaStorage(), /MEDIA_STORAGE_PROVIDER/);
  } finally {
    if (original.nodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = original.nodeEnv;
    if (original.provider === undefined) delete environment.MEDIA_STORAGE_PROVIDER;
    else environment.MEDIA_STORAGE_PROVIDER = original.provider;
    if (original.root === undefined) delete environment.MEDIA_LOCAL_ROOT;
    else environment.MEDIA_LOCAL_ROOT = original.root;
  }
});
