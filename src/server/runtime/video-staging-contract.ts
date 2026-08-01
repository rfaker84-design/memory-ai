import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export {
  authorizeVideoInternalRequest,
  getVideoInternalAccessConfiguration,
  type VideoInternalAccessKind,
} from "../security/video-internal-access";
import { getVideoInternalAccessConfiguration } from "../security/video-internal-access";

import {
  getStagingRuntimeConfiguration,
  STAGING_API_ORIGIN,
  type StagingRuntimeConfiguration,
} from "./staging-contract";

export class VideoStagingRuntimeConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "VideoStagingRuntimeConfigurationError";
  }
}

export type VideoArtifactStorageConfiguration = Readonly<{
  artifactRoot: string;
  evidenceRoot: string;
  signingSecret: string;
  previousSigningSecret: string | null;
  playbackBaseUrl: string;
  aiContentProviderName: string;
  aiContentProviderCode: string;
}>;

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const raw = environment[name];
  const value = raw?.trim();
  if (!value || raw !== value) throw new VideoStagingRuntimeConfigurationError(`${name}_NOT_CONFIGURED`);
  return value;
}

function requiredSecret(environment: NodeJS.ProcessEnv, name: string): string {
  const value = required(environment, name);
  if (Buffer.byteLength(value, "utf8") < 48) {
    throw new VideoStagingRuntimeConfigurationError(`${name}_NOT_CONFIGURED`);
  }
  return value;
}

function requireExact(environment: NodeJS.ProcessEnv, name: string, expected: string): void {
  if (required(environment, name) !== expected) {
    throw new VideoStagingRuntimeConfigurationError(`${name}_INVALID`);
  }
}

function physicalDirectory(environment: NodeJS.ProcessEnv, name: string, sharedRoot: string): string {
  const raw = required(environment, name);
  if (!isAbsolute(raw)) throw new VideoStagingRuntimeConfigurationError(`${name}_INVALID`);
  let resolved: string;
  try {
    resolved = resolve(realpathSync.native(raw));
    if (!statSync(resolved).isDirectory()) throw new Error("not directory");
  } catch {
    throw new VideoStagingRuntimeConfigurationError(`${name}_INVALID`);
  }
  const child = relative(sharedRoot, resolved);
  if (!child || child.startsWith("..") || isAbsolute(child)) {
    throw new VideoStagingRuntimeConfigurationError(`${name}_OUTSIDE_STAGING_SHARED_ROOT`);
  }
  return resolved;
}

function stagingSharedRoot(environment: NodeJS.ProcessEnv): string {
  const raw = required(environment, "VIDEO_STAGING_SHARED_ROOT");
  if (!isAbsolute(raw)) throw new VideoStagingRuntimeConfigurationError("VIDEO_STAGING_SHARED_ROOT_INVALID");
  try {
    const resolved = resolve(realpathSync.native(raw));
    if (!statSync(resolved).isDirectory()) throw new Error("not directory");
    return resolved;
  } catch {
    throw new VideoStagingRuntimeConfigurationError("VIDEO_STAGING_SHARED_ROOT_INVALID");
  }
}

function playbackBaseUrl(environment: NodeJS.ProcessEnv): string {
  const value = required(environment, "VIDEO_ARTIFACT_PLAYBACK_BASE_URL");
  try {
    const parsed = new URL(value);
    if (
      parsed.origin !== STAGING_API_ORIGIN
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) {
      throw new Error("invalid origin");
    }
    return parsed.toString();
  } catch {
    throw new VideoStagingRuntimeConfigurationError("VIDEO_ARTIFACT_PLAYBACK_BASE_URL_INVALID");
  }
}

function contentMarkingField(environment: NodeJS.ProcessEnv, name: string): string {
  const value = required(environment, name);
  if (value.length > 120 || /[\r\n;]/.test(value)) {
    throw new VideoStagingRuntimeConfigurationError(`${name}_INVALID`);
  }
  return value;
}

function previousSigningSecret(environment: NodeJS.ProcessEnv, now: Date): string | null {
  const previous = environment.VIDEO_ARTIFACT_SIGNING_SECRET_PREVIOUS;
  const validUntil = environment.VIDEO_ARTIFACT_SIGNING_SECRET_PREVIOUS_VALID_UNTIL;
  if (!previous && !validUntil) return null;
  const expiry = Date.parse(validUntil ?? "");
  if (!previous || !validUntil || previous !== previous.trim()
    || Buffer.byteLength(previous, "utf8") < 48
    || previous === environment.VIDEO_ARTIFACT_SIGNING_SECRET
    || !Number.isFinite(expiry) || expiry <= now.getTime() || expiry - now.getTime() > 900_000) {
    throw new VideoStagingRuntimeConfigurationError("VIDEO_ARTIFACT_SIGNING_SECRET_PREVIOUS_INVALID");
  }
  return previous;
}

/** Validates only the private local-staging artifact and evidence boundary. */
export function getVideoArtifactStorageConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): VideoArtifactStorageConfiguration {
  // This also requires NODE_ENV=production, DEPLOYMENT_ENV=staging, the exact
  // staging App origin, and the isolated staging database configuration.
  getStagingRuntimeConfiguration(environment);
  requireExact(environment, "VIDEO_ARTIFACT_STORAGE_PROVIDER", "local-staging");
  const sharedRoot = stagingSharedRoot(environment);
  const artifactRoot = physicalDirectory(environment, "VIDEO_ARTIFACT_STAGING_ROOT", sharedRoot);
  const evidenceRoot = physicalDirectory(environment, "VIDEO_WORKER_EVIDENCE_ROOT", sharedRoot);
  if (artifactRoot === evidenceRoot) {
    throw new VideoStagingRuntimeConfigurationError("VIDEO_ARTIFACT_EVIDENCE_ROOT_CONFLICT");
  }
  return Object.freeze({
    artifactRoot,
    evidenceRoot,
    signingSecret: requiredSecret(environment, "VIDEO_ARTIFACT_SIGNING_SECRET"),
    previousSigningSecret: previousSigningSecret(environment, now),
    playbackBaseUrl: playbackBaseUrl(environment),
    aiContentProviderName: contentMarkingField(environment, "AI_CONTENT_MARKING_PROVIDER_NAME"),
    aiContentProviderCode: contentMarkingField(environment, "AI_CONTENT_MARKING_PROVIDER_CODE"),
  });
}

function requireRawViduApiKey(environment: NodeJS.ProcessEnv): void {
  const raw = environment.VIDU_API_KEY;
  if (!raw) throw new VideoStagingRuntimeConfigurationError("VIDU_API_KEY_MISSING");
  if (/\r|\n/.test(raw) || raw !== raw.trim() || /["']/.test(raw) || /^(?:token|bearer)\b/i.test(raw)) {
    throw new VideoStagingRuntimeConfigurationError("VIDU_API_KEY_CONFIG_INVALID");
  }
}

/** Startup-only validation. It performs no database query and no Provider call. */
export function assertVideoWorkerStartupConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): Readonly<{ databaseName: string; pollIntervalMs: number; batchSize: number }> {
  const staging: StagingRuntimeConfiguration = getStagingRuntimeConfiguration(environment);
  getVideoArtifactStorageConfiguration(environment);
  getVideoInternalAccessConfiguration(environment);
  requireExact(environment, "YIJIAN_VIDEO_WORKER_ENABLED", "true");
  requireExact(environment, "VIDEO_WORKER_CONCURRENCY", "1");
  requireRawViduApiKey(environment);
  return Object.freeze({ databaseName: staging.databaseName, pollIntervalMs: 5_000, batchSize: 16 });
}
