import type { CreateMediaInput, MediaAsset, UpdateMediaInput } from "./types";

export interface MediaDataSource {
  create(input: CreateMediaInput): Promise<MediaAsset>;
  findById(id: string): Promise<MediaAsset | null>;
  update(id: string, input: UpdateMediaInput): Promise<MediaAsset>;
  delete(id: string): Promise<void>;
  listByMemory(memoryId: string): Promise<MediaAsset[]>;
  listByUser(userId: string): Promise<MediaAsset[]>;
}
