import assert from "node:assert/strict";
import test from "node:test";

import { TencentCosStorage } from "./tencent-cos-storage";

test("Tencent COS storage preserves upload, signed-read, and delete contracts without a network call", async () => {
  const calls: Array<{ operation: string; params: Record<string, unknown> }> = [];
  const client = {
    async putObject(params: Record<string, unknown>) {
      calls.push({ operation: "put", params });
      return { ETag: "etag-1" };
    },
    async deleteObject(params: Record<string, unknown>) {
      calls.push({ operation: "delete", params });
      return {};
    },
    getObjectUrl(
      params: Record<string, unknown>,
      callback: (error: null, result: { Url: string }) => void,
    ) {
      calls.push({ operation: "sign", params });
      callback(null, { Url: "https://private.invalid/signed" });
    },
  };
  const storage = new TencentCosStorage(
    { secretId: "id", secretKey: "key", bucket: "media-123", region: "ap-guangzhou" },
    client as never,
  );

  const stored = await storage.put({
    key: "media/user/photo.jpg",
    body: Buffer.from("image"),
    contentType: "image/jpeg",
    contentLength: 5,
    sha256: "a".repeat(64),
  });
  const signedUrl = await storage.createSignedDownloadUrl("media/user/photo.jpg", 300);
  await storage.delete("media/user/photo.jpg");

  assert.deepEqual(stored, { key: "media/user/photo.jpg", etag: "etag-1" });
  assert.equal(signedUrl, "https://private.invalid/signed");
  assert.deepEqual(calls.map(({ operation }) => operation), ["put", "sign", "delete"]);
  assert.deepEqual(calls[0].params, {
    Bucket: "media-123",
    Region: "ap-guangzhou",
    Key: "media/user/photo.jpg",
    Body: Buffer.from("image"),
    ContentLength: 5,
    ContentType: "image/jpeg",
    ContentDisposition: "attachment",
    Headers: { "x-cos-meta-sha256": "a".repeat(64) },
  });
  assert.deepEqual(calls[1].params, {
    Bucket: "media-123",
    Region: "ap-guangzhou",
    Key: "media/user/photo.jpg",
    Sign: true,
    Expires: 300,
  });
  assert.deepEqual(calls[2].params, {
    Bucket: "media-123",
    Region: "ap-guangzhou",
    Key: "media/user/photo.jpg",
  });
});
