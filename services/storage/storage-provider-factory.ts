import { LocalStorageProvider } from "./local-storage-provider";
import type { StorageProvider } from "./storage-provider";

export function createStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER || "local";

  if (provider === "local") {
    return new LocalStorageProvider();
  }

  throw new Error(
    "Unknown STORAGE_PROVIDER: " +
      provider +
      ". Valid values are: local."
  );
}
