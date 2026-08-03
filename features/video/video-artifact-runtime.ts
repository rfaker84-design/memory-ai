import { isAbsolute, resolve } from "node:path";

import { getVideoArtifactStorageConfiguration } from "@/src/server/runtime/video-staging-contract";

export type VideoArtifactRuntimeConfiguration = Readonly<{
  kind: "local-staging" | "cos";
  signingSecret: string;
  previousSigningSecret: string | null;
  evidenceRoot: string;
  playbackBaseUrl: string;
  aiContentProviderName: string;
  aiContentProviderCode: string;
  artifactRoot?: string;
  bucket?: string;
  region?: string;
  secretId?: string;
  secretKey?: string;
}>;

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name];
  if (!value || value !== value.trim()) throw new Error(`VIDEO_ARTIFACT_${name}_NOT_CONFIGURED`);
  return value;
}

function secret(environment: Record<string, string | undefined>, name: string): string {
  const value = required(environment, name);
  if (Buffer.byteLength(value, "utf8") < 48) throw new Error(`VIDEO_ARTIFACT_${name}_NOT_CONFIGURED`);
  return value;
}

function previousSigningSecret(environment: Record<string, string | undefined>, current: string): string | null {
  const previous = environment.VIDEO_ARTIFACT_SIGNING_SECRET_PREVIOUS;
  const validUntil = environment.VIDEO_ARTIFACT_SIGNING_SECRET_PREVIOUS_VALID_UNTIL;
  if (!previous && !validUntil) return null;
  const expiry = Date.parse(validUntil ?? "");
  if (!previous || !validUntil || previous !== previous.trim() || Buffer.byteLength(previous, "utf8") < 48 || previous === current || !Number.isFinite(expiry) || expiry <= Date.now() || expiry - Date.now() > 900_000) {
    throw new Error("VIDEO_ARTIFACT_SIGNING_SECRET_PREVIOUS_INVALID");
  }
  return previous;
}

function marker(environment: Record<string, string | undefined>, name: string): string {
  const value = required(environment, name);
  if (value.length > 120 || /[\r\n;]/.test(value)) throw new Error(`VIDEO_ARTIFACT_${name}_INVALID`);
  return value;
}

function playbackBaseUrl(environment: Record<string, string | undefined>): string {
  const value = required(environment, "VIDEO_ARTIFACT_PLAYBACK_BASE_URL");
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error();
    return parsed.toString();
  } catch { throw new Error("VIDEO_ARTIFACT_PLAYBACK_BASE_URL_INVALID"); }
}

export function getVideoArtifactRuntimeConfiguration(environment: Record<string, string | undefined> = process.env): VideoArtifactRuntimeConfiguration {
  if (environment.NODE_ENV === "production" && environment.DEPLOYMENT_ENV === "staging") {
    const staging = getVideoArtifactStorageConfiguration(environment as NodeJS.ProcessEnv);
    return Object.freeze({ kind: "local-staging", signingSecret: staging.signingSecret, previousSigningSecret: staging.previousSigningSecret, evidenceRoot: staging.evidenceRoot, aiContentProviderName: staging.aiContentProviderName, aiContentProviderCode: staging.aiContentProviderCode, artifactRoot: staging.artifactRoot, playbackBaseUrl: staging.playbackBaseUrl });
  }
  if (environment.NODE_ENV !== "production" || environment.DEPLOYMENT_ENV !== "production" || required(environment, "VIDEO_ARTIFACT_STORAGE_PROVIDER") !== "cos") {
    throw new Error("VIDEO_ARTIFACT_RUNTIME_UNAVAILABLE");
  }
  const evidenceRoot = required(environment, "VIDEO_WORKER_EVIDENCE_ROOT");
  if (!isAbsolute(evidenceRoot)) throw new Error("VIDEO_ARTIFACT_VIDEO_WORKER_EVIDENCE_ROOT_INVALID");
  const signingSecret = secret(environment, "VIDEO_ARTIFACT_SIGNING_SECRET");
  return Object.freeze({ kind: "cos", signingSecret, previousSigningSecret: previousSigningSecret(environment, signingSecret), evidenceRoot: resolve(evidenceRoot), playbackBaseUrl: playbackBaseUrl(environment), aiContentProviderName: marker(environment, "AI_CONTENT_MARKING_PROVIDER_NAME"), aiContentProviderCode: marker(environment, "AI_CONTENT_MARKING_PROVIDER_CODE"), bucket: required(environment, "COS_VIDEO_ARTIFACT_BUCKET"), region: required(environment, "COS_VIDEO_ARTIFACT_REGION"), secretId: required(environment, "TENCENT_SECRET_ID"), secretKey: required(environment, "TENCENT_SECRET_KEY") });
}

export function assertVideoWorkerRuntimeConfiguration(environment: Record<string, string | undefined> = process.env): VideoArtifactRuntimeConfiguration {
  const configuration = getVideoArtifactRuntimeConfiguration(environment);
  if (environment.YIJIAN_VIDEO_WORKER_ENABLED !== "true" || environment.VIDEO_WORKER_CONCURRENCY !== "1") throw new Error("VIDEO_WORKER_CONFIGURATION_INVALID");
  const key = required(environment, "VIDU_API_KEY");
  if (/[\r\n"']/.test(key) || /^(?:token|bearer)\b/i.test(key)) throw new Error("VIDU_API_KEY_CONFIG_INVALID");
  return configuration;
}
