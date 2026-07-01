export type StorageProviderType = "local" | "cos" | "s3";

export interface UploadFileInput {
  key: string;
  body: Buffer | Uint8Array | ReadableStream;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface UploadFileResult {
  key: string;
  url: string;
  size: number;
}

export interface DeleteFileInput {
  key: string;
}
