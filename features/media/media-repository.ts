import type { MediaDataSource } from "./datasource";
import type { CreateMediaInput, MediaAsset, UpdateMediaInput } from "./types";

export class MediaRepository {
  constructor(private readonly dataSource: MediaDataSource) {}

  createMedia(input: CreateMediaInput): Promise<MediaAsset> {
    return this.dataSource.create(input);
  }

  getMedia(id: string): Promise<MediaAsset | null> {
    return this.dataSource.findById(id);
  }

  updateMedia(id: string, input: UpdateMediaInput): Promise<MediaAsset> {
    return this.dataSource.update(id, input);
  }

  deleteMedia(id: string): Promise<void> {
    return this.dataSource.delete(id);
  }

  listMediaByMemory(memoryId: string): Promise<MediaAsset[]> {
    return this.dataSource.listByMemory(memoryId);
  }

  listMediaByUser(userId: string): Promise<MediaAsset[]> {
    return this.dataSource.listByUser(userId);
  }
}
