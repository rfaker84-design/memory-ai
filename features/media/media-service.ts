import { randomUUID } from "node:crypto";
import type { MediaStorage } from "../../src/server/storage";
import { validateMediaFile, type ValidateMediaOptions } from "./file-validation";
import { MediaRepository } from "./media-repository";

export class MediaServiceError extends Error {
  constructor(readonly code: string, readonly httpStatus: number) { super(code); }
}

export class MediaService {
  constructor(private readonly repository: MediaRepository, private readonly storage: MediaStorage,
    private readonly validationOptions: ValidateMediaOptions = {}) {}

  async upload(input: { externalUserId: string; memoryId: string; file: { name: string; type: string; body: Buffer } }) {
    const file = validateMediaFile(input.file, this.validationOptions);
    const storageKey = `media/${input.externalUserId}/${input.memoryId}/${file.mediaType}/${randomUUID()}${file.extension}`;
    const reserved = await this.repository.reserve({ externalUserId: input.externalUserId, memoryId: input.memoryId,
      mediaType: file.mediaType, storageKey, mimeType: file.mimeType, sizeBytes: file.sizeBytes, sha256: file.sha256 });
    if (reserved.duplicate) return { asset: reserved.asset, duplicate: true };
    try {
      await this.storage.put({ key: storageKey, body: file.body, contentType: file.mimeType,
        contentLength: file.sizeBytes, sha256: file.sha256 });
    } catch {
      await this.repository.markFailed(reserved.asset.id, input.externalUserId, "STORAGE_UPLOAD_FAILED").catch(() => undefined);
      throw new MediaServiceError("STORAGE_UNAVAILABLE", 503);
    }
    try {
      return { asset: await this.repository.markUploaded(reserved.asset.id, input.externalUserId), duplicate: false };
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      await this.repository.markFailed(reserved.asset.id, input.externalUserId, "DATABASE_COMMIT_FAILED").catch(() => undefined);
      throw error;
    }
  }

  async createDownloadUrl(id: string, userId: string, expiresInSeconds = 300) {
    const asset = await this.repository.findOwned(id, userId);
    if (!asset || asset.status !== "uploaded" || !asset.storageKey) throw new MediaServiceError("MEDIA_NOT_FOUND", 404);
    const ttl = Math.min(900, Math.max(30, expiresInSeconds));
    return { asset, url: await this.storage.createSignedDownloadUrl(asset.storageKey, ttl),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  async delete(id: string, userId: string) {
    const asset = await this.repository.softDelete(id, userId);
    if (!asset) throw new MediaServiceError("MEDIA_NOT_FOUND", 404);
    return asset;
  }
}
