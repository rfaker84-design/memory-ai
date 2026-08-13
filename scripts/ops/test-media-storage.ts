import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { safeMediaAsset } from "../../app/api/media/_lib";
import type { MediaDataSource } from "../../features/media/datasource";
import { validateMediaFile, MediaValidationError } from "../../features/media/file-validation";
import { MediaRepository } from "../../features/media/media-repository";
import { MediaService, MediaServiceError } from "../../features/media/media-service";
import { MediaType, type MediaAsset, type ReserveMediaInput } from "../../features/media/types";
import type { MediaStorage, StoreMediaInput } from "../../src/server/storage";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { POST as uploadRoute } from "../../app/api/media/upload/route";
import { DatabaseDependencyError } from "../../src/server/database";
import { mediaError } from "../../app/api/media/_lib";

async function qualifiedJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 720, height: 1280, channels: 3, background: { r: 94, g: 108, b: 122 } },
  }).composite([
    { input: Buffer.from('<svg width="720" height="1280"><path d="M0 0L720 1280M720 0L0 1280" stroke="#f3e8d7" stroke-width="32"/></svg>') },
  ]).jpeg({ quality: 92 }).toBuffer();
}
const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]);
const baseAsset = (input: ReserveMediaInput): MediaAsset => ({ id: "asset-1", userId: input.externalUserId,
  memoryId: input.memoryId, mediaType: input.mediaType, storageKey: input.storageKey, mimeType: input.mimeType,
  sizeBytes: input.sizeBytes, sha256: input.sha256, status: "pending", failureCode: null, metadata: input.metadata, deletedAt: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

class FakeDataSource implements MediaDataSource {
  asset?: MediaAsset; duplicate = false; failCommit = false;
  async reserve(input: ReserveMediaInput) { this.asset ??= baseAsset(input); return { asset: this.asset, duplicate: this.duplicate }; }
  async markUploaded() { if (this.failCommit) throw new Error("rollback"); this.asset = { ...this.asset!, status: "uploaded" }; return this.asset; }
  async markFailed(_id: string, _user: string, code: string) { this.asset = { ...this.asset!, status: "failed", failureCode: code }; }
  async updateQualityPreflight(_id: string, _user: string, metadata: Record<string, unknown>, failureCode: string | null) {
    this.asset = { ...this.asset!, metadata, failureCode };
    return this.asset;
  }
  async findOwned(_id: string, externalUserId: string) {
    return this.asset?.userId === externalUserId ? this.asset : null;
  }
  async softDelete(_id: string, externalUserId: string) {
    return this.asset?.userId === externalUserId
      ? { ...this.asset, status: "deleted" as const }
      : null;
  }
}
class FakeStorage implements MediaStorage {
  fail = false; deleted: string[] = []; putInput?: StoreMediaInput; ttl?: number;
  async put(input: StoreMediaInput) { if (this.fail) throw new Error("COS down"); this.putInput = input; return { key: input.key }; }
  async read() { return Buffer.alloc(0); }
  async delete(key: string) { this.deleted.push(key); }
  async createSignedDownloadUrl(_key: string, ttl: number) { this.ttl = ttl; return `https://private.invalid/signed?ttl=${ttl}`; }
}
const service = (db = new FakeDataSource(), storage = new FakeStorage()) => ({ db, storage,
  value: new MediaService(new MediaRepository(db), storage) });

test("image upload validates and uses a UUID key", async () => { const x = service(); const result = await x.value.upload({ externalUserId:"u",memoryId:"11111111-1111-1111-1111-111111111111",file:{name:"photo.jpg",type:"image/jpeg",body:await qualifiedJpeg()} }); assert.equal(result.asset.status,"uploaded"); assert.match(x.storage.putInput!.key,/\/[0-9a-f-]{36}\.jpg$/); });
test("audio upload is accepted", () => assert.equal(validateMediaFile({name:"voice.wav",type:"audio/wav",body:wav}).mediaType,MediaType.AUDIO));
test("illegal type and executable signature are rejected", () => { assert.throws(()=>validateMediaFile({name:"x.exe",type:"application/octet-stream",body:Buffer.from("MZ")}),MediaValidationError); });
test("oversized files are rejected", () => assert.throws(
  () => validateMediaFile({ name: "x.jpg", type: "image/jpeg", body: Buffer.from([0xff, 0xd8, 0xff]) }, { maxImageBytes: 2 }),
  /size limit/,
));
test("duplicate file skips storage upload", async () => { const x=service(); x.db.duplicate=true; const result=await x.value.upload({externalUserId:"u",memoryId:"m",file:{name:"x.jpg",type:"image/jpeg",body:await qualifiedJpeg()}}); assert.equal(result.duplicate,true); assert.equal(x.storage.putInput,undefined); });
test("COS unavailable marks upload failed", async () => {
  const x = service();
  x.storage.fail = true;
  const body = await qualifiedJpeg();
  await assert.rejects(
    () => x.value.upload({ externalUserId: "u", memoryId: "m", file: { name: "x.jpg", type: "image/jpeg", body } }),
    MediaServiceError,
  );
  assert.equal(x.db.asset?.status, "failed");
});
test("database rollback compensates by deleting COS object", async () => {
  const x = service();
  x.db.failCommit = true;
  const body = await qualifiedJpeg();
  await assert.rejects(() => x.value.upload({ externalUserId: "u", memoryId: "m", file: { name: "x.jpg", type: "image/jpeg", body } }));
  assert.equal(x.storage.deleted.length, 1);
});
test("signed URL TTL is capped", async () => { const x=service(); x.db.asset={...baseAsset({externalUserId:"u",memoryId:"m",mediaType:MediaType.IMAGE,storageKey:"key",mimeType:"image/jpeg",sizeBytes:1,sha256:"a".repeat(64)}),status:"uploaded"}; const result=await x.value.createDownloadUrl("id","u",9999); assert.equal(x.storage.ttl,900); assert.ok(Date.parse(result.expiresAt)>Date.now()); });
test("cross-user media reads and deletes are rejected", async () => { const x=service(); x.db.asset={...baseAsset({externalUserId:"owner",memoryId:"m",mediaType:MediaType.IMAGE,storageKey:"key",mimeType:"image/jpeg",sizeBytes:1,sha256:"a".repeat(64)}),status:"uploaded"}; await assert.rejects(()=>x.value.createDownloadUrl("id","attacker",300),/MEDIA_NOT_FOUND/); await assert.rejects(()=>x.value.delete("id","attacker"),/MEDIA_NOT_FOUND/); });
test("portrait selection is TA-bound and signed media responses do not expose ownership or storage keys", () => {
  const memoryDatasource = readFileSync(
    new URL("../../features/memory/memory-postgres-datasource.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    memoryDatasource,
    /FROM media_assets a\s+WHERE a\.memory_id = m\.id\s+AND a\.media_type = 'image'\s+AND a\.status = 'uploaded'\s+AND a\.deleted_at IS NULL/,
  );

  const hiddenAsset: MediaAsset = {
    id: "portrait-asset",
    userId: "owner-a",
    memoryId: "ta-a",
    mediaType: MediaType.IMAGE,
    mimeType: "image/png",
    sizeBytes: 42,
    storageKey: "media/owner-a/ta-a/portrait.png",
    sha256: "a".repeat(64),
    status: "uploaded",
    failureCode: null,
    metadata: {},
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    deletedAt: null,
  };
  const safeAsset = safeMediaAsset(hiddenAsset);

  assert.deepEqual(safeAsset, {
    id: "portrait-asset",
    mediaType: "image",
    mimeType: "image/png",
    sizeBytes: 42,
    status: "uploaded",
    createdAt: "2026-07-24T00:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(safeAsset), /owner-a|ta-a|storageKey|media\//);
});
test("upload route rejects unauthenticated access", async () => { const response=await uploadRoute(new NextRequest("http://localhost/api/media/upload",{method:"POST"})); assert.equal(response.status,401); });
test("media database dependency failures are retryable and do not expose details", async () => {
  const response = mediaError(new DatabaseDependencyError("connection_refused", "ECONNREFUSED"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "DATABASE_UNAVAILABLE" });
});
