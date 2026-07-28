import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { createStagingMediaUrl } from "../runtime/staging-media";

import type { MediaStorage, StoreMediaInput, StoredMediaObject } from "./media-storage";

export function resolveStagingMediaPath(root: string, key: string): string {
  if (!isAbsolute(root)) throw new Error("STAGING_MEDIA_ROOT_INVALID");
  const resolvedRoot = resolve(root);
  const pathSegments = key.split("/");
  if (pathSegments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) {
    throw new Error("STAGING_MEDIA_PATH_INVALID");
  }
  // Database storage keys retain their canonical `phone:<hash>` form. Encode
  // individual segments for the filesystem so staging works on Windows too.
  const resolvedFile = resolve(resolvedRoot, ...pathSegments.map(encodeURIComponent));
  const pathFromRoot = relative(resolvedRoot, resolvedFile);
  if (!pathFromRoot || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error("STAGING_MEDIA_PATH_INVALID");
  }
  return resolvedFile;
}

export class StagingLocalMediaStorage implements MediaStorage {
  constructor(private readonly root: string) {}

  async put(input: StoreMediaInput): Promise<StoredMediaObject> {
    const filePath = resolveStagingMediaPath(this.root, input.key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body, { flag: "wx" });
    return { key: input.key };
  }

  async delete(key: string): Promise<void> {
    const filePath = resolveStagingMediaPath(this.root, key);
    await rm(filePath, { force: true });
  }

  async createSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    return createStagingMediaUrl(key, expiresInSeconds);
  }

  async read(key: string): Promise<Buffer> {
    return readFile(resolveStagingMediaPath(this.root, key));
  }
}
