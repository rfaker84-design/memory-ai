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

export class TencentCosStorage implements MediaStorage {
  private readonly client: COS;

  constructor(private readonly options: TencentCosStorageOptions) {
    this.client = new COS({
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
