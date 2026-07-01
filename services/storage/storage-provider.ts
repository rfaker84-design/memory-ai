import type { DeleteFileInput, UploadFileInput, UploadFileResult } from "./types";

export interface StorageProvider {
  upload(input: UploadFileInput): Promise<UploadFileResult>;
  delete(input: DeleteFileInput): Promise<void>;
  getPublicUrl(key: string): string;
}
