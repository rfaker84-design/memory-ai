export enum MediaType { IMAGE = "image", AUDIO = "audio", VIDEO = "video", AVATAR = "avatar", DOCUMENT = "document" }
export type MediaStatus = "pending" | "uploaded" | "failed" | "deleted" | "cleanup_failed";
export interface MediaAsset {
  id: string; userId: string; memoryId: string; mediaType: MediaType;
  storageKey: string | null; mimeType: string; sizeBytes: number; sha256: string;
  status: MediaStatus; failureCode: string | null; deletedAt: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string; updatedAt: string;
}
export interface ReserveMediaInput {
  externalUserId: string; memoryId: string; mediaType: MediaType; storageKey: string;
  mimeType: string; sizeBytes: number; sha256: string;
  metadata?: Record<string, unknown>;
}
export interface ReserveMediaResult { asset: MediaAsset; duplicate: boolean }
