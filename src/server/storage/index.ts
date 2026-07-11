import type { MediaStorage } from "./media-storage";
import { TencentCosStorage } from "./tencent-cos-storage";

export * from "./media-storage";
export * from "./tencent-cos-storage";

function requiredServerEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`STORAGE_CONFIGURATION_MISSING:${name}`);
  return value;
}

export function createMediaStorage(): MediaStorage {
  return new TencentCosStorage({
    secretId: requiredServerEnvironment("TENCENT_SECRET_ID"),
    secretKey: requiredServerEnvironment("TENCENT_SECRET_KEY"),
    bucket: requiredServerEnvironment("COS_MEDIA_BUCKET"),
    region: requiredServerEnvironment("COS_MEDIA_REGION"),
  });
}
