import type { MediaRepository } from "./media-repository";
import type {
  CreateMediaInput,
  CreateUploadIntentInput,
  MediaAsset,
  UpdateMediaInput,
  UploadIntentResult,
} from "./types";
import { createStorageProvider } from "../../services/storage/storage-provider-factory";
import type { StorageProvider } from "../../services/storage/storage-provider";

export class MediaService {
  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly storageProvider: StorageProvider = createStorageProvider()
  ) {}

  createMedia(input: CreateMediaInput): Promise<MediaAsset> {
    return this.mediaRepository.createMedia(input);
  }

  getMedia(id: string): Promise<MediaAsset | null> {
    return this.mediaRepository.getMedia(id);
  }

  updateMedia(id: string, input: UpdateMediaInput): Promise<MediaAsset> {
    return this.mediaRepository.updateMedia(id, input);
  }

  deleteMedia(id: string): Promise<void> {
    return this.mediaRepository.deleteMedia(id);
  }

  listMediaByMemory(memoryId: string): Promise<MediaAsset[]> {
    return this.mediaRepository.listMediaByMemory(memoryId);
  }

  listMediaByUser(userId: string): Promise<MediaAsset[]> {
    return this.mediaRepository.listMediaByUser(userId);
  }

  createUploadIntent(input: CreateUploadIntentInput): UploadIntentResult {
    const timestamp = Date.now();
    const key =
      "memories/" +
      input.memoryId +
      "/" +
      input.mediaType.toLowerCase() +
      "/" +
      timestamp +
      "-" +
      input.fileName;

    const provider = process.env.STORAGE_PROVIDER || "local";

    return {
      key,
      provider,
      status: "pending",
    };
  }
}
