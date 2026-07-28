import { createHmac, timingSafeEqual } from "node:crypto";

import {
  getStagingRuntimeConfiguration,
  STAGING_API_ORIGIN,
} from "./staging-contract";

function validateStorageKey(key: string): string {
  if (!/^media\/[A-Za-z0-9:_-]+\/[0-9a-f-]{36}\/(image|audio|video)\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i.test(key)) {
    throw new Error("STAGING_MEDIA_KEY_INVALID");
  }
  return key;
}

function signature(secret: string, key: string, expiresAt: number): string {
  return createHmac("sha256", secret)
    .update(`staging-media\0${key}\0${expiresAt}`)
    .digest("base64url");
}

export function createStagingMediaUrl(
  key: string,
  expiresInSeconds: number,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configuration = getStagingRuntimeConfiguration(environment);
  const safeKey = validateStorageKey(key);
  const boundedTtl = Math.min(900, Math.max(30, expiresInSeconds));
  const expiresAt = Math.floor(Date.now() / 1000) + boundedTtl;
  const url = new URL("/api/media/local", STAGING_API_ORIGIN);
  url.searchParams.set("key", safeKey);
  url.searchParams.set("expires", String(expiresAt));
  url.searchParams.set("signature", signature(configuration.mediaSigningSecret, safeKey, expiresAt));
  return url.toString();
}

export function verifyStagingMediaUrl(
  input: { key: string | null; expires: string | null; signature: string | null },
  environment: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!input.key || !input.expires || !input.signature) return null;
  let key: string;
  try {
    key = validateStorageKey(input.key);
  } catch {
    return null;
  }
  const expiresAt = Number(input.expires);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;

  const configuration = getStagingRuntimeConfiguration(environment);
  const expected = Buffer.from(signature(configuration.mediaSigningSecret, key, expiresAt));
  const candidate = Buffer.from(input.signature);
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return null;
  return key;
}
