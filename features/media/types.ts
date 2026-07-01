export enum MediaType {
  IMAGE = "IMAGE",
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
  AVATAR = "AVATAR",
  DOCUMENT = "DOCUMENT",
}

export interface MediaAsset {
  id: string;
  userId: string;
  memoryId: string;
  mediaType: MediaType;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string;
  size: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateMediaInput = Omit<
  MediaAsset,
  "id" | "createdAt" | "updatedAt"
>;

export type UpdateMediaInput = Partial<
  Pick<MediaAsset, "status" | "thumbnailUrl" | "url">
>;

export interface CreateUploadIntentInput {
  memoryId: string;
  mediaType: MediaType;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface UploadIntentResult {
  key: string;
  provider: string;
  status: "pending";
}
