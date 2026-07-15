import assert from "node:assert/strict";
import test from "node:test";
import type { MediaDataSource } from "../../features/media/datasource";
import { validateMediaFile, MediaValidationError } from "../../features/media/file-validation";
import { MediaRepository } from "../../features/media/media-repository";
import { MediaService, MediaServiceError } from "../../features/media/media-service";
import { MediaType, type MediaAsset, type ReserveMediaInput } from "../../features/media/types";
import type { MediaStorage, StoreMediaInput } from "../../src/server/storage";
import { NextRequest } from "next/server";
import { POST as uploadRoute } from "../../app/api/media/upload/route";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 1]);
const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]);
const baseAsset = (input: ReserveMediaInput): MediaAsset => ({ id: "asset-1", userId: input.externalUserId,
  memoryId: input.memoryId, mediaType: input.mediaType, storageKey: input.storageKey, mimeType: input.mimeType,
  sizeBytes: input.sizeBytes, sha256: input.sha256, status: "pending", failureCode: null, deletedAt: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

class FakeDataSource implements MediaDataSource {
  asset?: MediaAsset; duplicate = false; failCommit = false;
  async reserve(input: ReserveMediaInput) { this.asset ??= baseAsset(input); return { asset: this.asset, duplicate: this.duplicate }; }
  async markUploaded() { if (this.failCommit) throw new Error("rollback"); this.asset = { ...this.asset!, status: "uploaded" }; return this.asset; }
  async markFailed(_id: string, _user: string, code: string) { this.asset = { ...this.asset!, status: "failed", failureCode: code }; }
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
  async delete(key: string) { this.deleted.push(key); }
  async createSignedDownloadUrl(_key: string, ttl: number) { this.ttl = ttl; return `https://private.invalid/signed?ttl=${ttl}`; }
}
const service = (db = new FakeDataSource(), storage = new FakeStorage()) => ({ db, storage,
  value: new MediaService(new MediaRepository(db), storage) });

test("image upload validates and uses a UUID key", async () => { const x = service(); const result = await x.value.upload({ externalUserId:"u",memoryId:"11111111-1111-1111-1111-111111111111",file:{name:"photo.jpg",type:"image/jpeg",body:jpeg} }); assert.equal(result.asset.status,"uploaded"); assert.match(x.storage.putInput!.key,/\/[0-9a-f-]{36}\.jpg$/); });
test("audio upload is accepted", () => assert.equal(validateMediaFile({name:"voice.wav",type:"audio/wav",body:wav}).mediaType,MediaType.AUDIO));
test("illegal type and executable signature are rejected", () => { assert.throws(()=>validateMediaFile({name:"x.exe",type:"application/octet-stream",body:Buffer.from("MZ")}),MediaValidationError); });
test("oversized files are rejected", () => assert.throws(()=>validateMediaFile({name:"x.jpg",type:"image/jpeg",body:jpeg},{maxImageBytes:2}),/size limit/));
test("duplicate file skips storage upload", async () => { const x=service(); x.db.duplicate=true; const result=await x.value.upload({externalUserId:"u",memoryId:"m",file:{name:"x.jpg",type:"image/jpeg",body:jpeg}}); assert.equal(result.duplicate,true); assert.equal(x.storage.putInput,undefined); });
test("COS unavailable marks upload failed", async () => { const x=service(); x.storage.fail=true; await assert.rejects(()=>x.value.upload({externalUserId:"u",memoryId:"m",file:{name:"x.jpg",type:"image/jpeg",body:jpeg}}),MediaServiceError); assert.equal(x.db.asset?.status,"failed"); });
test("database rollback compensates by deleting COS object", async () => { const x=service(); x.db.failCommit=true; await assert.rejects(()=>x.value.upload({externalUserId:"u",memoryId:"m",file:{name:"x.jpg",type:"image/jpeg",body:jpeg}})); assert.equal(x.storage.deleted.length,1); });
test("signed URL TTL is capped", async () => { const x=service(); x.db.asset={...baseAsset({externalUserId:"u",memoryId:"m",mediaType:MediaType.IMAGE,storageKey:"key",mimeType:"image/jpeg",sizeBytes:1,sha256:"a".repeat(64)}),status:"uploaded"}; const result=await x.value.createDownloadUrl("id","u",9999); assert.equal(x.storage.ttl,900); assert.ok(Date.parse(result.expiresAt)>Date.now()); });
test("cross-user media reads and deletes are rejected", async () => { const x=service(); x.db.asset={...baseAsset({externalUserId:"owner",memoryId:"m",mediaType:MediaType.IMAGE,storageKey:"key",mimeType:"image/jpeg",sizeBytes:1,sha256:"a".repeat(64)}),status:"uploaded"}; await assert.rejects(()=>x.value.createDownloadUrl("id","attacker",300),/MEDIA_NOT_FOUND/); await assert.rejects(()=>x.value.delete("id","attacker"),/MEDIA_NOT_FOUND/); });
test("upload route rejects unauthenticated access", async () => { const response=await uploadRoute(new NextRequest("http://localhost/api/media/upload",{method:"POST"})); assert.equal(response.status,401); });
