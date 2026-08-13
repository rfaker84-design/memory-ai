import { createHmac, timingSafeEqual } from "node:crypto";

import type { ApprovedVideoArtifact, VideoArtifactQueryPort } from "./video-artifact-query";
import type { VideoArtifactStoragePort, VideoPlaybackRendition } from "./video-artifact-storage";

export type VideoArtifactReaderPort = {
  readRange(input: {
    artifactKey: string;
    start?: number;
    end?: number;
    rendition?: VideoPlaybackRendition;
  }): Promise<{
    body: Buffer;
    contentType: string;
    totalBytes: number;
  }>;
};

export type PlaybackAuthorizationDto = {
  url: string;
  expiresAt: string;
  contentDisposition: "inline";
  saveAllowed: boolean;
};

type SignedPlaybackClaims = {
  version: 1;
  ownerBinding: string;
  memoryId: string;
  jobId: string;
  artifactBinding: string;
  expiresAt: number;
};
type VerifiedPlaybackClaims = SignedPlaybackClaims & { signingSecretIndex: number };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_PLAYBACK_TTL_SECONDS = 900;

export class FirstPresencePlaybackError extends Error {
  constructor(readonly code: "PLAYBACK_NOT_AVAILABLE" | "PLAYBACK_UNAVAILABLE") {
    super(code);
  }
}

function encode(value: SignedPlaybackClaims): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(value: string): SignedPlaybackClaims | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed !== "object"
      || parsed === null
      || Array.isArray(parsed)
    ) return null;
    const claims = parsed as Record<string, unknown>;
    if (
      claims.version !== 1
      || typeof claims.ownerBinding !== "string"
      || !/^[A-Za-z0-9_-]{43}$/.test(claims.ownerBinding)
      || typeof claims.memoryId !== "string"
      || !UUID_PATTERN.test(claims.memoryId)
      || typeof claims.jobId !== "string"
      || !UUID_PATTERN.test(claims.jobId)
      || typeof claims.artifactBinding !== "string"
      || !/^[A-Za-z0-9_-]{43}$/.test(claims.artifactBinding)
      || typeof claims.expiresAt !== "number"
      || !Number.isSafeInteger(claims.expiresAt)
    ) return null;
    return claims as SignedPlaybackClaims;
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

/** HMAC-signed, bounded bearer token. It never contains the storage object key. */
export class FirstPresencePlaybackSigner {
  private readonly secrets: readonly string[];

  constructor(secret: string, previousSecret?: string | null) {
    if (Buffer.byteLength(secret, "utf8") < 32 || (previousSecret && Buffer.byteLength(previousSecret, "utf8") < 32)) {
      throw new FirstPresencePlaybackError("PLAYBACK_UNAVAILABLE");
    }
    this.secrets = Object.freeze([secret, ...(previousSecret ? [previousSecret] : [])]);
  }

  issue(input: {
    artifact: ApprovedVideoArtifact;
    externalUserId: string;
    now?: Date;
    ttlSeconds?: number;
  }): { token: string; expiresAt: string } {
    const ttlSeconds = Math.min(
      Math.max(1, Math.floor(input.ttlSeconds ?? MAX_PLAYBACK_TTL_SECONDS)),
      MAX_PLAYBACK_TTL_SECONDS,
    );
    const expiresAt = Math.floor((input.now ?? new Date()).getTime() / 1000) + ttlSeconds;
    const payload = encode({
      version: 1,
      ownerBinding: this.binding(input.externalUserId),
      memoryId: input.artifact.memoryId,
      jobId: input.artifact.jobId,
      artifactBinding: this.binding(input.artifact.artifactKey),
      expiresAt,
    });
    const signature = createHmac("sha256", this.secrets[0]).update(payload, "utf8").digest("base64url");
    return { token: `${payload}.${signature}`, expiresAt: new Date(expiresAt * 1000).toISOString() };
  }

  verify(token: string, now: Date = new Date()): VerifiedPlaybackClaims | null {
    if (!TOKEN_PATTERN.test(token)) return null;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const claims = decode(payload);
    if (!claims || claims.expiresAt <= Math.floor(now.getTime() / 1000)) return null;
    for (const [signingSecretIndex, secret] of this.secrets.entries()) {
      const expected = createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
      if (safeEqual(signature, expected)) return { ...claims, signingSecretIndex };
    }
    return null;
  }

  assertMatchesArtifact(claims: VerifiedPlaybackClaims, artifact: ApprovedVideoArtifact, externalUserId: string): boolean {
    const secret = this.secrets[claims.signingSecretIndex];
    if (!secret) return false;
    return safeEqual(claims.ownerBinding, this.binding(externalUserId, secret))
      && claims.memoryId === artifact.memoryId
      && claims.jobId === artifact.jobId
      && safeEqual(claims.artifactBinding, this.binding(artifact.artifactKey, secret));
  }

  private binding(value: string, secret = this.secrets[0]): string {
    return createHmac("sha256", secret).update(value, "utf8").digest("base64url");
  }
}

export class FirstPresenceVideoArtifactStorageReader implements VideoArtifactReaderPort {
  constructor(private readonly storage: VideoArtifactStoragePort) {}

  readRange(input: { artifactKey: string; start?: number; end?: number; rendition?: VideoPlaybackRendition }) {
    return this.storage.readArtifactRange(input);
  }
}

export class FirstPresencePlaybackAuthorizationService {
  constructor(
    private readonly artifacts: VideoArtifactQueryPort,
    private readonly signer: FirstPresencePlaybackSigner,
    private readonly assetPath = (token: string) => `/api/first-presence-video/playback/${encodeURIComponent(token)}`,
  ) {}

  async authorize(input: {
    externalUserId: string;
    memoryId: string;
    jobId: string;
    now?: Date;
  }): Promise<PlaybackAuthorizationDto> {
    const artifact = await this.artifacts.findApprovedForOwner(input);
    if (!artifact) throw new FirstPresencePlaybackError("PLAYBACK_NOT_AVAILABLE");
    const signed = this.signer.issue({ artifact, externalUserId: input.externalUserId, now: input.now });
    return {
      url: this.assetPath(signed.token),
      expiresAt: signed.expiresAt,
      contentDisposition: "inline",
      saveAllowed: artifact.saveAllowed,
    };
  }
}

export function parseSingleRange(range: string | null, totalBytes: number): { start: number; end: number } | null | "invalid" {
  if (!range) return null;
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 1 || !/^bytes=\d*-\d*$/.test(range)) return "invalid";
  const [startText, endText] = range.slice("bytes=".length).split("-");
  if (!startText && !endText) return "invalid";
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) return "invalid";
    return { start: Math.max(0, totalBytes - suffixLength), end: totalBytes - 1 };
  }
  const start = Number(startText);
  const end = endText ? Number(endText) : totalBytes - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= totalBytes) return "invalid";
  return { start, end: Math.min(end, totalBytes - 1) };
}

export function assertPlayableArtifact(input: {
  signer: FirstPresencePlaybackSigner;
  token: string;
  externalUserId: string;
  artifact: ApprovedVideoArtifact | null;
  now?: Date;
}): ApprovedVideoArtifact {
  const claims = input.signer.verify(input.token, input.now);
  if (!claims || !input.artifact || !input.signer.assertMatchesArtifact(claims, input.artifact, input.externalUserId)) {
    throw new FirstPresencePlaybackError("PLAYBACK_NOT_AVAILABLE");
  }
  return input.artifact;
}
