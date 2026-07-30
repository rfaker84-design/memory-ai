import { createMediaStorage } from "../../src/server/storage";
import { getVideoArtifactStorageConfiguration } from "../../src/server/runtime/video-staging-contract";

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
import {
  createVideoArtifactStorageFromEnvironment,
  type VideoArtifactStoragePort,
} from "./video-artifact-storage";

function requiredEvidenceRoot(): string {
  return getVideoArtifactStorageConfiguration().evidenceRoot;
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
  );
}

async function imageDataUrlFromSignedSource(source: string): Promise<string> {
  if (/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(source)) {
    return source;
  }
  const response = await fetch(source, { redirect: "error" });
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
  if (!response.ok || !contentType?.startsWith("image/")) {
    throw new Error("VIDEO_INPUT_SOURCE_UNAVAILABLE");
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length) throw new Error("VIDEO_INPUT_SOURCE_UNAVAILABLE");
  return `data:${contentType};base64,${body.toString("base64")}`;
}

class FirstPresenceVideoOwnerInputStaging implements OwnerVideoInputStagingPort {
  constructor(
    private readonly media = createMediaStorage(),
    private readonly artifacts: VideoArtifactStoragePort = createVideoArtifactStorageFromEnvironment(),
  ) {}

  async stage(input: { jobId: string; storageKey: string }): Promise<void> {
    const source = await this.media.createSignedDownloadUrl(input.storageKey, 60);
    await this.artifacts.stageInput({
      jobId: input.jobId,
      imageDataUrl: await imageDataUrlFromSignedSource(source),
    });
  }

  discard(input: { jobId: string }): Promise<void> {
    return this.artifacts.deleteInput(input);
  }
}

/** Constructs the private bridge from an owned media object to worker input. */
export function createFirstPresenceVideoOwnerInputStaging(): OwnerVideoInputStagingPort {
  return new FirstPresenceVideoOwnerInputStaging();
}
