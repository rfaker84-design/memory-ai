import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

import type { MediaStorage, StoredMediaObject, StoreMediaInput } from "./media-storage";

type LocalMediaStorageConfig = {
  root: string;
};

function resolvePhysicalPath(path: string): string {
  const resolvedPath = resolve(path);
  try {
    return resolve(realpathSync.native(resolvedPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return resolve(realpathSync.native(dirname(resolvedPath)), basename(resolvedPath));
  }
}

function mediaTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}

export class LocalMediaStorage implements MediaStorage {
  private readonly root: string;

  constructor(config: LocalMediaStorageConfig) {
    if (!isAbsolute(config.root)) {
      throw new Error("STORAGE_CONFIGURATION_MISSING:MEDIA_LOCAL_ROOT");
    }
    this.root = resolvePhysicalPath(config.root);
    const temporaryRoot = resolvePhysicalPath(tmpdir());
    const child = relative(temporaryRoot, this.root);
    if (
      !child
      || child.startsWith("..")
      || isAbsolute(child)
      || /[\\/]/.test(child)
      || !child.startsWith("memoryai-local-media-")
    ) {
      throw new Error("STORAGE_CONFIGURATION_MISSING:MEDIA_LOCAL_ROOT");
    }
  }

  private pathForKey(key: string): string {
    if (
      !key
      || !/^[A-Za-z0-9._/-]+$/.test(key)
      || key.split("/").some((segment) => segment === ".." || !segment)
    ) {
      throw new Error("STORAGE_INVALID_KEY");
    }
    const normalizedKey = normalize(key.replaceAll("\\", "/"));
    const target = resolve(join(this.root, normalizedKey));
    const childPath = relative(this.root, target);
    if (
      normalizedKey.startsWith("/")
      || childPath.startsWith("..")
      || isAbsolute(childPath)
    ) {
      throw new Error("STORAGE_INVALID_KEY");
    }
    return target;
  }

  async put(input: StoreMediaInput): Promise<StoredMediaObject> {
    if (
      input.body.byteLength !== input.contentLength
      || createHash("sha256").update(input.body).digest("hex") !== input.sha256
    ) {
      throw new Error("STORAGE_INVALID_BODY");
    }
    const target = this.pathForKey(input.key);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, input.body, { flag: "wx" });
    return { key: input.key, etag: input.sha256 };
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.pathForKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async createSignedDownloadUrl(
    key: string,
    _expiresInSeconds: number
  ): Promise<string> {
    const path = this.pathForKey(key);
    const body = await readFile(path);
    return `data:${mediaTypeForPath(path)};base64,${body.toString("base64")}`;
  }
}
