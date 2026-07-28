import {
  evaluateFirstPresenceQuality,
  type FirstPresenceMediaProbe,
  type FirstPresenceQualityDecision,
  type FirstPresenceVisualCheck,
} from "./first-presence-quality-gate";
import type {
  ViduFirstPresencePoll,
  ViduFirstPresenceProvider,
} from "./vidu-first-presence-provider";
import { ViduFirstPresenceNetworkError } from "./vidu-first-presence-provider";

export type FirstPresenceVideoStatus =
  | "queued"
  | "submitting"
  | "submitted"
  | "running"
  | "succeeded"
  | "rejected"
  | "failed"
  | "submission_uncertain";

export type FirstPresenceVideoJob = {
  id: string;
  externalUserId: string;
  memoryId: string;
  idempotencyKey: string;
  status: FirstPresenceVideoStatus;
  provider: "vidu-cn-q2-pro-fast";
  providerTaskId: string | null;
  providerState: string | null;
  inputSha256: string;
  actualCredits: number | null;
  artifactKey: string | null;
  quality: FirstPresenceQualityDecision | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateFirstPresenceVideoInput = {
  externalUserId: string;
  memoryId: string;
  idempotencyKey: string;
  imageDataUrl: string;
  imageSha256: string;
};

export type FirstPresenceVideoRepository = {
  findByIdempotencyKey(input: {
    externalUserId: string;
    memoryId: string;
    idempotencyKey: string;
  }): Promise<FirstPresenceVideoJob | null>;
  findById(id: string): Promise<FirstPresenceVideoJob | null>;
  createQueued(input: CreateFirstPresenceVideoInput): Promise<FirstPresenceVideoJob>;
  markSubmitting(id: string): Promise<FirstPresenceVideoJob>;
  markSubmitted(input: {
    id: string;
    providerTaskId: string;
    providerState: string;
    actualCredits: number | null;
  }): Promise<FirstPresenceVideoJob>;
  markRunning(input: {
    id: string;
    providerState: string;
    actualCredits: number | null;
  }): Promise<FirstPresenceVideoJob>;
  markSubmissionUncertain(input: {
    id: string;
    errorCode: string;
  }): Promise<FirstPresenceVideoJob>;
  markFailed(input: {
    id: string;
    providerState: string | null;
    actualCredits: number | null;
    errorCode: string;
  }): Promise<FirstPresenceVideoJob>;
  markRejected(input: {
    id: string;
    providerState: string | null;
    actualCredits: number | null;
    artifactKey: string | null;
    quality: FirstPresenceQualityDecision | null;
    errorCode: string;
  }): Promise<FirstPresenceVideoJob>;
  markSucceeded(input: {
    id: string;
    providerState: string;
    actualCredits: number | null;
    artifactKey: string;
    quality: FirstPresenceQualityDecision;
  }): Promise<FirstPresenceVideoJob>;
};

export type FirstPresenceEntitlementPort = {
  reserve(input: {
    externalUserId: string;
    memoryId: string;
    idempotencyKey: string;
  }): Promise<"reserved" | "duplicate" | "unavailable">;
  release(input: {
    externalUserId: string;
    memoryId: string;
    idempotencyKey: string;
  }): Promise<void>;
  commit(input: {
    externalUserId: string;
    memoryId: string;
    idempotencyKey: string;
  }): Promise<void>;
};

export type FirstPresenceArtifactStore = {
  download(input: { url: string; jobId: string }): Promise<{
    artifactKey: string;
    body: Buffer;
  }>;
};

export type FirstPresenceMediaProbePort = {
  probe(input: { artifactKey: string; body: Buffer }): Promise<FirstPresenceMediaProbe>;
};

export type FirstPresenceVisualAnalyzer = {
  analyze(input: { artifactKey: string; body: Buffer }): Promise<FirstPresenceVisualCheck>;
};

const TERMINAL_STATUSES = new Set<FirstPresenceVideoStatus>([
  "succeeded",
  "rejected",
  "failed",
  "submission_uncertain",
]);

export class FirstPresenceVideoService {
  constructor(
    private readonly repository: FirstPresenceVideoRepository,
    private readonly provider: Pick<ViduFirstPresenceProvider, "submit" | "poll">,
    private readonly entitlements: FirstPresenceEntitlementPort,
    private readonly artifacts: FirstPresenceArtifactStore,
    private readonly mediaProbe: FirstPresenceMediaProbePort,
    private readonly visualAnalyzer: FirstPresenceVisualAnalyzer
  ) {}

  async submit(input: CreateFirstPresenceVideoInput): Promise<FirstPresenceVideoJob> {
    const existing = await this.repository.findByIdempotencyKey({
      externalUserId: input.externalUserId,
      memoryId: input.memoryId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) return existing;

    const reservation = await this.entitlements.reserve({
      externalUserId: input.externalUserId,
      memoryId: input.memoryId,
      idempotencyKey: input.idempotencyKey,
    });
    if (reservation === "unavailable") {
      throw new Error("FIRST_PRESENCE_VIDEO_ENTITLEMENT_UNAVAILABLE");
    }

    let job = await this.repository.createQueued(input);
    job = await this.repository.markSubmitting(job.id);
    try {
      const submission = await this.provider.submit({
        imageDataUrl: input.imageDataUrl,
        imageSha256: input.imageSha256,
        idempotencyKey: job.id,
      });
      return await this.repository.markSubmitted({
        id: job.id,
        providerTaskId: submission.taskId,
        providerState: submission.providerState,
        actualCredits: submission.credits,
      });
    } catch (error) {
      if (error instanceof ViduFirstPresenceNetworkError) {
        return this.repository.markSubmissionUncertain({
          id: job.id,
          errorCode: "SUBMIT_RESPONSE_LOST",
        });
      }
      await this.entitlements.release({
        externalUserId: input.externalUserId,
        memoryId: input.memoryId,
        idempotencyKey: input.idempotencyKey,
      });
      return this.repository.markFailed({
        id: job.id,
        providerState: null,
        actualCredits: null,
        errorCode: "SUBMIT_FAILED",
      });
    }
  }

  async recover(jobId: string): Promise<FirstPresenceVideoJob> {
    const job = await this.repository.findById(jobId);
    if (!job) throw new Error("FIRST_PRESENCE_VIDEO_JOB_NOT_FOUND");
    if (TERMINAL_STATUSES.has(job.status)) return job;
    if (!job.providerTaskId) return job;
    return this.pollAndFinalize(job);
  }

  private async pollAndFinalize(job: FirstPresenceVideoJob): Promise<FirstPresenceVideoJob> {
    const poll = await this.provider.poll(job.providerTaskId!);
    if (poll.state === "running") {
      return this.repository.markRunning({
        id: job.id,
        providerState: poll.providerState,
        actualCredits: poll.credits,
      });
    }
    if (poll.state === "failed") {
      await this.releaseUserEntitlement(job);
      return this.repository.markFailed({
        id: job.id,
        providerState: poll.providerState,
        actualCredits: poll.credits,
        errorCode: poll.errorCode,
      });
    }
    return this.finalizeSucceededProviderJob(job, poll);
  }

  private async finalizeSucceededProviderJob(
    job: FirstPresenceVideoJob,
    poll: Extract<ViduFirstPresencePoll, { state: "succeeded" }>
  ): Promise<FirstPresenceVideoJob> {
    const artifact = await this.artifacts.download({
      url: poll.outputUrl,
      jobId: job.id,
    });
    const quality = evaluateFirstPresenceQuality({
      media: await this.mediaProbe.probe(artifact),
      visual: await this.visualAnalyzer.analyze(artifact),
    });

    if (quality.status === "reject") {
      await this.releaseUserEntitlement(job);
      return this.repository.markRejected({
        id: job.id,
        providerState: poll.providerState,
        actualCredits: poll.credits,
        artifactKey: artifact.artifactKey,
        quality,
        errorCode: quality.reasons[0] ?? "QUALITY_REJECTED",
      });
    }

    await this.entitlements.commit({
      externalUserId: job.externalUserId,
      memoryId: job.memoryId,
      idempotencyKey: job.idempotencyKey,
    });
    return this.repository.markSucceeded({
      id: job.id,
      providerState: poll.providerState,
      actualCredits: poll.credits,
      artifactKey: artifact.artifactKey,
      quality,
    });
  }

  private releaseUserEntitlement(job: FirstPresenceVideoJob): Promise<void> {
    return this.entitlements.release({
      externalUserId: job.externalUserId,
      memoryId: job.memoryId,
      idempotencyKey: job.idempotencyKey,
    });
  }
}
