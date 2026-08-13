export interface StoreMediaInput {
  key: string;
  body: Buffer;
  contentType: string;
  contentLength: number;
  sha256: string;
}

export interface StoredMediaObject {
  key: string;
  etag?: string;
}

export interface MediaStorage {
  put(input: StoreMediaInput): Promise<StoredMediaObject>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  createSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
}
