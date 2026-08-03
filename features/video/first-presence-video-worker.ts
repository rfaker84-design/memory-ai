import type { FirstPresenceVideoJob, FirstPresenceVideoStatus } from "./first-presence-video-service";

export type FirstPresenceVideoWorkerRepository = {
  listWorkerCandidates(input: { limit: number }): Promise<FirstPresenceVideoJob[]>;
};

export type FirstPresenceVideoWorkerService = {
  processQueued(jobId: string): Promise<FirstPresenceVideoJob>;
  recover(jobId: string): Promise<FirstPresenceVideoJob>;
};

export type VideoWorkerRunResult = {
  scanned: number;
  processed: number;
  /** Safe for aggregate worker logs; job identifiers and raw Provider errors stay out of it. */
  failures: Array<{ code: "VIDEO_WORKER_JOB_FAILURE" }>;
};

const RECOVERABLE = new Set<FirstPresenceVideoStatus>([
  "submitting", "submitted", "running", "quality_pending",
]);

/**
 * Stateless durable worker. The database owns claim/terminal state; therefore
 * multiple PM2 instances may scan the same batch without re-submitting a job.
 */
export class FirstPresenceVideoWorker {
  constructor(
    private readonly repository: FirstPresenceVideoWorkerRepository,
    private readonly service: FirstPresenceVideoWorkerService,
  ) {}

  async runOnce(limit = 16): Promise<VideoWorkerRunResult> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("VIDEO_WORKER_LIMIT_INVALID");
    const candidates = await this.repository.listWorkerCandidates({ limit });
    const failures: VideoWorkerRunResult["failures"] = [];
    let processed = 0;
    for (const candidate of candidates) {
      try {
        if (candidate.status === "queued") await this.service.processQueued(candidate.id);
        else if (RECOVERABLE.has(candidate.status)) await this.service.recover(candidate.id);
        else continue;
        processed += 1;
      } catch (error) {
        // The durable job record has the controlled error state. Do not copy an
        // identifier or raw Provider/storage exception into process logs.
        void error;
        failures.push({ code: "VIDEO_WORKER_JOB_FAILURE" });
      }
    }
    return { scanned: candidates.length, processed, failures };
  }
}
