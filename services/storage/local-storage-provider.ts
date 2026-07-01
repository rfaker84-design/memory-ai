import type { StorageProvider } from "./storage-provider";
import type { DeleteFileInput, UploadFileInput, UploadFileResult } from "./types";

export class LocalStorageProvider implements StorageProvider {
  async upload(_input: UploadFileInput): Promise<UploadFileResult> {
    throw new Error("Not implemented");
  }

  async delete(_input: DeleteFileInput): Promise<void> {
    throw new Error("Not implemented");
  }

  getPublicUrl(_key: string): string {
    throw new Error("Not implemented");
  }
}
