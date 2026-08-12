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
  | "quality_pending"
  | "manual_review_required"
  | "succeeded"
  | "rejected"
  | "failed"
  | "submission_uncertain";

export type VideoGenerationUseCase = "first_presence" | "companion_micro_motion";
export type CompanionMotionVariant = "idle" | "attentive" | "reflective";

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
  /** Undefined is accepted only for legacy in-memory adapters and means first_presence. */
  useCase?: VideoGenerationUseCase;
  motionVariant?: CompanionMotionVariant | null;
  packVersion?: number;
};

export type CreateFirstPresenceVideoInput = {
  externalUserId: string;
  memoryId: string;
  idempotencyKey: string;
  imageDataUrl: string;
  imageSha256: string;
  useCase?: VideoGenerationUseCase;
  motionVariant?: CompanionMotionVariant | null;
  packVersion?: number;
};

export type FirstPresenceVideoRepository = {
  findByIdempotencyKey(input: {
    externalUserId: string;
    memoryId: string;
    idempotencyKey: string;
  }): Promise<FirstPresenceVideoJob | null>;
  findById(id: string): Promise<FirstPresenceVideoJob | null>;
  listWorkerCandidates(input: { limit: number }): Promise<FirstPresenceVideoJob[]>;
  createQueued(input: CreateFirstPresenceVideoInput): Promise<FirstPresenceVideoJob>;
  /** Atomically moves a queued job to submitting. Only its winner may call Vidu. */
  claimSubmission(id: string): Promise<FirstPresenceVideoJob | null>;
  /** Links the job to the existing Commerce reservation after the winner reserves it. */
  markReserved(id: string): Promise<FirstPresenceVideoJob>;
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
  markQualityPending(input: {
    id: string;
    providerState: string;
    actualCredits: number | null;
  }): Promise<FirstPresenceVideoJob>;
  markSubmissionUncertain(input: {
    id: string;
    errorCode: string;
    providerTaskId?: string;
    providerState?: string;
    actualCredits?: number | null;
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
  /** Persists the manual decision and settles the linked Commerce reservation atomically. */
  settleManualReview(input: {
    id: string;
    manualReview: FirstPresenceManualReview;
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
    outcome?: "system_failed" | "invalidated";
  }): Promise<void>;
  commit(input: {
    externalUserId: string;
    memoryId: string;
    idempotencyKey: string;
  }): Promise<void>;
};

export type CompanionMotionEntitlementPort = {
  assertActive(input: {
    externalUserId: string;
    memoryId: string;
  }): Promise<void>;
};

export type FirstPresenceArtifactStore = {
  stageInput(input: { jobId: string; imageDataUrl: string }): Promise<void>;
  readInput(input: { jobId: string }): Promise<string>;
  deleteInput(input: { jobId: string }): Promise<void>;
  download(input: { url: string; jobId: string }): Promise<{ artifactKey: string; body: Buffer; contentType: string | null }>;
  stageArtifact(input: { jobId: string; body: Buffer; contentType: string | null }): Promise<{ artifactKey: string; body: Buffer; contentType: string | null }>;
  deleteArtifact(input: { artifactKey: string }): Promise<void>;
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

export const COMPANION_MOTION_PROVIDER_HARD_TIMEOUT_MS = 30 * 60 * 1000;
export const COMPANION_MOTION_MANUAL_REVIEW_REASONS = [
  "NO_TALK_OR_LIP_MOVEMENT_UNVERIFIED",
  "NO_WAVE_LARGE_GESTURE_OR_LOUD_LAUGH_UNVERIFIED",
  "FIXED_CAMERA_UNVERIFIED",
  "LOOP_POSTURE_CONTINUITY_UNVERIFIED",
] as const;

function companionMotionProviderTimedOut(
  job: FirstPresenceVideoJob,
  nowMs: number = Date.now(),
): boolean {
  if (
    job.useCase !== "companion_micro_motion"
    || (job.status !== "submitted" && job.status !== "running")
  ) {
    return false;
  }
  const createdAtMs = Date.parse(job.createdAt);
  return Number.isFinite(createdAtMs)
    && nowMs - createdAtMs >= COMPANION_MOTION_PROVIDER_HARD_TIMEOUT_MS;
}

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
    private readonly reviewPolicy: FirstPresenceReviewPolicy = new EnvironmentFirstPresenceReviewPolicy(),
    private readonly companionEntitlements?: CompanionMotionEntitlementPort,
  ) {}

  async submit(input: CreateFirstPresenceVideoInput): Promise<FirstPresenceVideoJob> {
    const existing = await this.repository.findByIdempotencyKey({
      externalUserId: input.externalUserId,
      memoryId: input.memoryId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) return existing;

    const queued = await this.enqueue(input);
    return this.processQueued(queued.id);
  }

  /** Persists the provider input in private staging before a worker may claim. */
  async enqueue(input: CreateFirstPresenceVideoInput): Promise<FirstPresenceVideoJob> {
    const existing = await this.repository.findByIdempotencyKey({
      externalUserId: input.externalUserId,
      memoryId: input.memoryId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      if (existing.status === "queued") {
        await this.artifacts.stageInput({ jobId: existing.id, imageDataUrl: input.imageDataUrl });
      }
      return existing;
    }
    const created = await this.repository.createQueued(input);
    try {
      await this.artifacts.stageInput({ jobId: created.id, imageDataUrl: input.imageDataUrl });
      return created;
    } catch (error) {
      await this.markFailedAfterInputCleanup({
        id: created.id,
        providerState: null,
        actualCredits: null,
        errorCode: "INPUT_STAGING_FAILED",
      });
      throw error;
    }
  }

  /** Only a winner of the durable queued -> submitting claim may call Vidu. */
  async processQueued(jobId: string): Promise<FirstPresenceVideoJob> {
    const current = await this.repository.findById(jobId);
    if (!current) throw new Error("FIRST_PRESENCE_VIDEO_JOB_NOT_FOUND");
    const job = await this.repository.claimSubmission(current.id);
    // A concurrent worker already owns the durable submission claim. Returning
    // the persisted job makes retries safe without a second provider request.
    if (!job) {
      return (await this.repository.findById(current.id)) ?? current;
    }
    const isCompanionMotion = job.useCase === "companion_micro_motion";
    if (isCompanionMotion) {
      if (!this.companionEntitlements) {
        return this.markFailedAfterInputCleanup({
          id: job.id,
          providerState: null,
          actualCredits: null,
          errorCode: "COMPANION_ENTITLEMENT_UNAVAILABLE",
        });
      }
      try {
        await this.companionEntitlements.assertActive({
          externalUserId: job.externalUserId,
          memoryId: job.memoryId,
        });
      } catch {
        return this.markFailedAfterInputCleanup({
          id: job.id,
          providerState: null,
          actualCredits: null,
          errorCode: "COMPANION_ENTITLEMENT_UNAVAILABLE",
        });
      }
    } else {
      const reservation = await this.entitlements.reserve({
        externalUserId: job.externalUserId,
        memoryId: job.memoryId,
        idempotencyKey: job.idempotencyKey,
      });
      if (reservation === "unavailable") {
        return this.markFailedAfterInputCleanup({
          id: job.id,
          providerState: null,
          actualCredits: null,
          errorCode: "ENTITLEMENT_UNAVAILABLE",
        });
      }
      await this.repository.markReserved(job.id);
    }
    let submission: Awaited<ReturnType<ViduFirstPresenceProvider["submit"]>>;
    try {
      const imageDataUrl = await this.artifacts.readInput({ jobId: job.id });
      submission = await this.provider.submit({
        imageDataUrl,
        imageSha256: job.inputSha256,
        idempotencyKey: job.id,
        motionVariant: job.motionVariant ?? undefined,
      });
    } catch (error) {
      if (error instanceof ViduFirstPresenceNetworkError) {
        return this.repository.markSubmissionUncertain({
          id: job.id,
          errorCode: "SUBMIT_RESPONSE_LOST",
        });
      }
      await this.releaseUserEntitlement(job);
      return this.markFailedAfterInputCleanup({
        id: job.id,
        providerState: null,
        actualCredits: null,
        errorCode: "SUBMIT_FAILED",
      });
    }
    let submitted: FirstPresenceVideoJob;
    try {
      submitted = await this.repository.markSubmitted({
        id: job.id,
        providerTaskId: submission.taskId,
        providerState: submission.providerState,
        actualCredits: submission.credits,
      });
    } catch {
      // Vidu has already accepted the request. Never reinterpret a local
      // persistence failure as a deterministic Provider failure, release the
      // entitlement, delete the input, or retry the external submit. Persist
      // every known Provider identifier for explicit reconciliation instead.
      return this.repository.markSubmissionUncertain({
        id: job.id,
        errorCode: "SUBMIT_ACCEPTED_LEDGER_WRITE_FAILED",
        providerTaskId: submission.taskId,
        providerState: submission.providerState,
        actualCredits: submission.credits,
      });
    }
    await this.deleteInputBestEffort(job.id);
    return submitted;
  }

  async recover(jobId: string): Promise<FirstPresenceVideoJob> {
    const job = await this.repository.findById(jobId);
    if (!job) throw new Error("FIRST_PRESENCE_VIDEO_JOB_NOT_FOUND");
    if (TERMINAL_STATUSES.has(job.status)) return job;
    if (companionMotionProviderTimedOut(job)) {
      await this.releaseUserEntitlement(job);
      return this.markFailedAfterInputCleanup({
        id: job.id,
        providerState: job.providerState,
        actualCredits: job.actualCredits,
        errorCode: "COMPANION_MOTION_PROVIDER_TIMEOUT",
      });
    }
    if (!job.providerTaskId) {
      if (job.status === "submitting") {
        return this.repository.markSubmissionUncertain({
          id: job.id,
          errorCode: "SUBMIT_STATE_RECOVERY_REQUIRED",
        });
      }
      return job;
    }
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
    const manualReview: FirstPresenceManualReview = {
      reviewerAccount: input.reviewerAccount,
      reviewedAt: (input.now ?? new Date()).toISOString(),
      action: input.action,
      reason: input.reason.trim(),
    };
    const settled = await this.repository.settleManualReview({
      id: input.jobId,
      manualReview,
    });
    if (settled.status === "rejected" && settled.artifactKey) {
      await this.artifacts.deleteArtifact({ artifactKey: settled.artifactKey });
    }
    return settled;
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
      return this.markFailedAfterInputCleanup({
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
    // Persist this boundary before downloading and evaluating media. A process
    // restart can poll again, but cannot commit the entitlement before quality.
    await this.repository.markQualityPending({
      id: job.id,
      providerState: poll.providerState,
      actualCredits: poll.credits,
    });
    let downloaded: Awaited<ReturnType<FirstPresenceArtifactStore["download"]>>;
    try {
      downloaded = await this.artifacts.download({
        url: poll.outputUrl,
        jobId: job.id,
      });
    } catch {
      await this.releaseUserEntitlement(job);
      return this.markFailedAfterInputCleanup({
        id: job.id,
        providerState: poll.providerState,
        actualCredits: poll.credits,
        errorCode: "ARTIFACT_DOWNLOAD_FAILED",
      });
    }

    let artifact: Awaited<ReturnType<FirstPresenceArtifactStore["stageArtifact"]>>;
    try {
      artifact = await this.artifacts.stageArtifact({
        jobId: job.id,
        body: downloaded.body,
        contentType: downloaded.contentType,
      });
    } catch {
      await this.releaseUserEntitlement(job);
      return this.markFailedAfterInputCleanup({
        id: job.id,
        providerState: poll.providerState,
        actualCredits: poll.credits,
        errorCode: "ARTIFACT_STAGING_FAILED",
      });
    }

    let quality: FirstPresenceQualityDecision;
    try {
      quality = evaluateFirstPresenceQuality({
        media: await this.mediaInspector.inspect(artifact),
      });
      if (
        job.useCase === "companion_micro_motion"
        && quality.status === "manual_review_required"
      ) {
        quality = {
          ...quality,
          manualReviewReasons: [
            ...quality.manualReviewReasons,
            ...COMPANION_MOTION_MANUAL_REVIEW_REASONS,
          ],
        };
      }
    } catch {
      await this.artifacts.deleteArtifact({ artifactKey: artifact.artifactKey });
      await this.releaseUserEntitlement(job);
      return this.markFailedAfterInputCleanup({
        id: job.id,
        providerState: poll.providerState,
        actualCredits: poll.credits,
        errorCode: "MEDIA_INSPECTION_FAILED",
      });
    }

    if (quality.status === "reject") {
      await this.artifacts.deleteArtifact({ artifactKey: artifact.artifactKey });
      await this.releaseUserEntitlement(job, "invalidated");
      return this.repository.markRejected({
        id: job.id,
        providerState: poll.providerState,
        actualCredits: poll.credits,
        artifactKey: null,
        quality,
        errorCode: quality.reasons[0] ?? "QUALITY_REJECTED",
      });
    }

    await this.deleteInputBestEffort(job.id);
    return this.repository.markManualReviewRequired({
      id: job.id,
      providerState: poll.providerState,
      actualCredits: poll.credits,
      artifactKey: artifact.artifactKey,
      quality,
    });
  }

  private releaseUserEntitlement(
    job: FirstPresenceVideoJob,
    outcome: "system_failed" | "invalidated" = "system_failed",
  ): Promise<void> {
    if (job.useCase === "companion_micro_motion") return Promise.resolve();
    return this.entitlements.release({
      externalUserId: job.externalUserId,
      memoryId: job.memoryId,
      idempotencyKey: job.idempotencyKey,
      outcome,
    });
  }

  private async markFailedAfterInputCleanup(input: {
    id: string;
    providerState: string | null;
    actualCredits: number | null;
    errorCode: string;
  }): Promise<FirstPresenceVideoJob> {
    const failedJob = await this.repository.markFailed(input);
    await this.deleteInputBestEffort(input.id);
    return failedJob;
  }

  private async deleteInputBestEffort(jobId: string): Promise<void> {
    try {
      await this.artifacts.deleteInput({ jobId });
    } catch {
      console.error("[video] input cleanup failed", {
        error: "VIDEO_INPUT_CLEANUP_FAILED",
      });
    }
  }
}
