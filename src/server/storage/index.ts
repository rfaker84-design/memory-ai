import type { MediaStorage } from "./media-storage";
import { LocalMediaStorage } from "./local-media-storage";
import { TencentCosStorage } from "./tencent-cos-storage";
import { getStagingRuntimeConfiguration, isStagingRuntime } from "../runtime/staging-contract";
import { StagingLocalMediaStorage } from "./staging-local-media-storage";

export * from "./local-media-storage";
export * from "./media-storage";
export * from "./tencent-cos-storage";
export * from "./staging-local-media-storage";

function requiredServerEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`STORAGE_CONFIGURATION_MISSING:${name}`);
  return value;
}

export function createMediaStorage(): MediaStorage {
  if (isStagingRuntime()) {
    return new StagingLocalMediaStorage(getStagingRuntimeConfiguration().mediaRoot);
  }

  const provider = process.env.MEDIA_STORAGE_PROVIDER?.trim() || "cos";
  if (provider === "local") {
    if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development") {
      throw new Error("STORAGE_CONFIGURATION_MISSING:MEDIA_STORAGE_PROVIDER");
    }
    return new LocalMediaStorage({
      root: requiredServerEnvironment("MEDIA_LOCAL_ROOT"),
    });
  }
  if (provider !== "cos") {
    throw new Error("STORAGE_CONFIGURATION_MISSING:MEDIA_STORAGE_PROVIDER");
  }
  return new TencentCosStorage({
    secretId: requiredServerEnvironment("TENCENT_SECRET_ID"),
    secretKey: requiredServerEnvironment("TENCENT_SECRET_KEY"),
    bucket: requiredServerEnvironment("COS_MEDIA_BUCKET"),
    region: requiredServerEnvironment("COS_MEDIA_REGION"),
  });
}
