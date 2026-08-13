import { createMediaStorage } from "../../src/server/storage";
import { deriveCompanionMotionInput } from "./companion-motion-input";
import { getVideoArtifactRuntimeConfiguration } from "./video-artifact-runtime";

import type { OwnerVideoInputStagingPort } from "./first-presence-video-owner-api";
import {
  FirstPresenceCommerceEntitlementPort,
  FirstPresenceVideoPostgresRepository,
} from "./first-presence-video-postgres";
import {
  FfmpegFirstPresenceMediaInspector,
} from "./first-presence-media-inspection";
import { FirstPresenceVideoService } from "./first-presence-video-service";
import { ViduFirstPresenceProvider } from "./vidu-first-presence-provider";
import { PostgresCompanionMotionEntitlementPort } from "./companion-micro-motion";
import {
  createVideoArtifactStorageFromEnvironment,
  type VideoArtifactStoragePort,
} from "./video-artifact-storage";

export const VIDEO_INPUT_DOWNLOAD_TIMEOUT_MS = 20_000;
export const VIDEO_INPUT_MAX_BYTES = 20 * 1024 * 1024;
const VIDEO_INPUT_MAX_DATA_URL_LENGTH = Math.ceil(VIDEO_INPUT_MAX_BYTES * 4 / 3) + 128;

function requiredEvidenceRoot(): string {
  return getVideoArtifactRuntimeConfiguration().evidenceRoot;
}

/** One composition root for the durable worker and internal review endpoint. */
export function createFirstPresenceVideoRuntime(): FirstPresenceVideoService {
  const artifacts = createVideoArtifactStorageFromEnvironment();
  return new FirstPresenceVideoService(
    new FirstPresenceVideoPostgresRepository(),
    new ViduFirstPresenceProvider(),
    new FirstPresenceCommerceEntitlementPort(),
    artifacts,
    new FfmpegFirstPresenceMediaInspector({ evidenceRoot: requiredEvidenceRoot() }),
    undefined,
    new PostgresCompanionMotionEntitlementPort(),
  );
}

/**
 * Converts the owner-scoped signed image into the provider's data-url input.
 * This is deliberately a single, bounded read: a worker must never wait
 * indefinitely or follow redirects before it can make a provider submission.
 */
export async function loadVideoInputDataUrl(
  source: string,
  request: typeof fetch = fetch,
  timeoutMs = VIDEO_INPUT_DOWNLOAD_TIMEOUT_MS,
): Promise<string> {
  if (/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(source)) {
    if (source.length > VIDEO_INPUT_MAX_DATA_URL_LENGTH) {
      throw new Error("VIDEO_INPUT_SOURCE_UNAVAILABLE");
    }
    return source;
  }
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await request(source, { redirect: "error", signal: controller.signal });
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
    const declaredLength = response.headers.get("content-length");
    const declaredBytes = declaredLength === null ? null : Number(declaredLength);
    if (
      !response.ok
      || !contentType?.startsWith("image/")
      || (declaredBytes !== null && (!Number.isSafeInteger(declaredBytes) || declaredBytes < 1 || declaredBytes > VIDEO_INPUT_MAX_BYTES))
    ) {
      throw new Error("VIDEO_INPUT_SOURCE_UNAVAILABLE");
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length || body.length > VIDEO_INPUT_MAX_BYTES) throw new Error("VIDEO_INPUT_SOURCE_UNAVAILABLE");
    return `data:${contentType};base64,${body.toString("base64")}`;
  } catch {
    throw new Error("VIDEO_INPUT_SOURCE_UNAVAILABLE");
  } finally {
    globalThis.clearTimeout(timer);
  }
}

class FirstPresenceVideoOwnerInputStaging implements OwnerVideoInputStagingPort {
  constructor(
    private readonly media = createMediaStorage(),
    private readonly artifacts: VideoArtifactStoragePort = createVideoArtifactStorageFromEnvironment(),
  ) {}

  async stage(input: {
    jobId: string;
    storageKey?: string;
    imageDataUrl?: string;
  }): Promise<{ inputSha256?: string }> {
    if (!input.imageDataUrl && !input.storageKey) throw new Error("VIDEO_INPUT_SOURCE_UNAVAILABLE");
    const imageDataUrl = input.imageDataUrl ?? await this.loadOriginalInput(input.storageKey!);
    await this.artifacts.stageInput({
      jobId: input.jobId,
      imageDataUrl,
    });
    return {};
  }

  async prepareCompanionMotionInput(input: {
    storageKey: string;
  }): Promise<{ imageDataUrl: string; inputSha256: string }> {
    return deriveCompanionMotionInput(await this.loadOriginalInput(input.storageKey));
  }

  discard(input: { jobId: string }): Promise<void> {
    return this.artifacts.deleteInput(input);
  }

  private async loadOriginalInput(storageKey: string): Promise<string> {
    const source = await this.media.createSignedDownloadUrl(storageKey, 60);
    return loadVideoInputDataUrl(source);
  }
}

/** Constructs the private bridge from an owned media object to worker input. */
export function createFirstPresenceVideoOwnerInputStaging(): OwnerVideoInputStagingPort {
  return new FirstPresenceVideoOwnerInputStaging();
}
