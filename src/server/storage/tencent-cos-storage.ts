import COS from "cos-nodejs-sdk-v5";

import type {
  MediaStorage,
  StoreMediaInput,
  StoredMediaObject,
} from "./media-storage";

interface TencentCosStorageOptions {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
}

type TencentCosClient = Pick<COS, "putObject" | "deleteObject" | "getObject" | "getObjectUrl">;

export class TencentCosStorage implements MediaStorage {
  private readonly client: TencentCosClient;

  constructor(
    private readonly options: TencentCosStorageOptions,
    client?: TencentCosClient,
  ) {
    this.client = client ?? new COS({
      SecretId: options.secretId,
      SecretKey: options.secretKey,
    });
  }

  async put(input: StoreMediaInput): Promise<StoredMediaObject> {
    const result = await this.client.putObject({
      Bucket: this.options.bucket,
      Region: this.options.region,
      Key: input.key,
      Body: input.body,
      ContentLength: input.contentLength,
      ContentType: input.contentType,
      ContentDisposition: "attachment",
      Headers: { "x-cos-meta-sha256": input.sha256 },
    });

    return { key: input.key, etag: result.ETag };
  }

  async read(key: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      this.client.getObject({
        Bucket: this.options.bucket,
        Region: this.options.region,
        Key: key,
      }, (error, data) => {
        if (error) return reject(error);
        if (!Buffer.isBuffer(data.Body)) return reject(new Error("STORAGE_INVALID_READ"));
        return resolve(data.Body);
      });
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.deleteObject({
      Bucket: this.options.bucket,
      Region: this.options.region,
      Key: key,
    });
  }

  async createSignedDownloadUrl(
    key: string,
    expiresInSeconds: number
  ): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      this.client.getObjectUrl(
        {
          Bucket: this.options.bucket,
          Region: this.options.region,
          Key: key,
          Sign: true,
          Expires: expiresInSeconds,
        },
        (error, data) => {
          if (error) reject(error);
          else resolve(data.Url);
        }
      );
    });
  }
}
