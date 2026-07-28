import {
  evaluateFirstPresenceQuality,
  type FirstPresenceMediaProbe,
  type FirstPresenceQualityDecision,
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
  | "manual_review_required"
  | "succeeded"
  | "rejected"
  | "failed"
  | "submission_uncertain";

export type FirstPresenceManualReview = {
  reviewerAccount: string;
  reviewedAt: string;
  action: "approve" | "reject";
  reason: string;
};

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
  manualReview: FirstPresenceManualReview | null;
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
  markManualReviewRequired(input: {
    id: string;
    providerState: string;
    actualCredits: number | null;
    artifactKey: string;
    quality: FirstPresenceQualityDecision;
  }): Promise<FirstPresenceVideoJob>;
  markRejected(input: {
    id: string;
    providerState: string | null;
    actualCredits: number | null;
    artifactKey: string | null;
    quality: FirstPresenceQualityDecision | null;
    errorCode: string;
    manualReview?: FirstPresenceManualReview;
  }): Promise<FirstPresenceVideoJob>;
  markSucceeded(input: {
    id: string;
    providerState: string;
    actualCredits: number | null;
    artifactKey: string;
    quality: FirstPresenceQualityDecision;
    manualReview: FirstPresenceManualReview;
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
  inspect(input: { artifactKey: string; body: Buffer }): Promise<FirstPresenceMediaProbe>;
};

export type FirstPresenceReviewPolicy = {
  assertCanReview(input: { reviewerAccount: string }): void;
};

const TERMINAL_STATUSES = new Set<FirstPresenceVideoStatus>([
  "succeeded",
  "rejected",
  "failed",
  "submission_uncertain",
]);

export class EnvironmentFirstPresenceReviewPolicy implements FirstPresenceReviewPolicy {
  constructor(private readonly environment: Record<string, string | undefined> = process.env) {}

  assertCanReview(input: { reviewerAccount: string }): void {
    const enabled = this.environment.YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED === "true";
    const expected = this.environment.YIJIAN_VIDEO_REVIEW_ACCOUNT;
    if (!enabled || !expected || input.reviewerAccount !== expected) {
      throw new Error("FIRST_PRESENCE_REVIEW_UNAUTHORIZED");
    }
  }
}

export class FirstPresenceVideoService {
  constructor(
    private readonly repository: FirstPresenceVideoRepository,
    private readonly provider: Pick<ViduFirstPresenceProvider, "submit" | "poll">,
    private readonly entitlements: FirstPresenceEntitlementPort,
    private readonly artifacts: FirstPresenceArtifactStore,
    private readonly mediaInspector: FirstPresenceMediaProbePort,
    private readonly reviewPolicy: FirstPresenceReviewPolicy = new EnvironmentFirstPresenceReviewPolicy()
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

  async review(input: {
    jobId: string;
    reviewerAccount: string;
    action: "approve" | "reject";
    reason: string;
    now?: Date;
  }): Promise<FirstPresenceVideoJob> {
    this.reviewPolicy.assertCanReview({ reviewerAccount: input.reviewerAccount });
    if (!input.reason.trim()) throw new Error("FIRST_PRESENCE_REVIEW_REASON_REQUIRED");
    const job = await this.repository.findById(input.jobId);
    if (!job) throw new Error("FIRST_PRESENCE_VIDEO_JOB_NOT_FOUND");
    if (job.status !== "manual_review_required" || !job.quality || !job.artifactKey) {
      throw new Error("FIRST_PRESENCE_VIDEO_NOT_REVIEWABLE");
    }
    const manualReview: FirstPresenceManualReview = {
      reviewerAccount: input.reviewerAccount,
      reviewedAt: (input.now ?? new Date()).toISOString(),
      action: input.action,
      reason: input.reason.trim(),
    };
    if (input.action === "reject") {
      await this.releaseUserEntitlement(job);
      return this.repository.markRejected({
        id: job.id,
        providerState: job.providerState,
        actualCredits: job.actualCredits,
        artifactKey: job.artifactKey,
        quality: job.quality,
        errorCode: "MANUAL_REVIEW_REJECTED",
        manualReview,
      });
    }
    await this.entitlements.commit({
      externalUserId: job.externalUserId,
      memoryId: job.memoryId,
      idempotencyKey: job.idempotencyKey,
    });
    return this.repository.markSucceeded({
      id: job.id,
      providerState: job.providerState ?? "success",
      actualCredits: job.actualCredits,
      artifactKey: job.artifactKey,
      quality: job.quality,
      manualReview,
    });
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
    let artifact: Awaited<ReturnType<FirstPresenceArtifactStore["download"]>>;
    try {
      artifact = await this.artifacts.download({
        url: poll.outputUrl,
        jobId: job.id,
      });
    } catch {
      await this.releaseUserEntitlement(job);
      return this.repository.markFailed({
        id: job.id,
        providerState: poll.providerState,
        actualCredits: poll.credits,
        errorCode: "ARTIFACT_DOWNLOAD_FAILED",
      });
    }

    let quality: FirstPresenceQualityDecision;
    try {
      quality = evaluateFirstPresenceQuality({
        media: await this.mediaInspector.inspect(artifact),
      });
    } catch {
      await this.releaseUserEntitlement(job);
      return this.repository.markFailed({
        id: job.id,
        providerState: poll.providerState,
        actualCredits: poll.credits,
        errorCode: "MEDIA_INSPECTION_FAILED",
      });
    }

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

    return this.repository.markManualReviewRequired({
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
