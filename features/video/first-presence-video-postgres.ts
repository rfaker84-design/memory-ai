import {
  queryPostgres,
  withPostgresTransaction,
} from "../../src/server/database";
import { CommercePostgresDataSource } from "../commerce/commerce-postgres-datasource";
import type { CommerceDataSource } from "../commerce/commerce-datasource";
import { CommerceStateError } from "../commerce/errors";
import type { GenerationSettlementOutcome } from "../commerce/types";
import type { FirstPresenceQualityDecision } from "./first-presence-quality-gate";
import type {
  CreateFirstPresenceVideoInput,
  FirstPresenceEntitlementPort,
  FirstPresenceManualReview,
  FirstPresenceVideoJob,
  FirstPresenceVideoRepository,
  FirstPresenceVideoStatus,
} from "./first-presence-video-service";

type JobRow = {
  id: string;
  external_user_id: string;
  memory_id: string;
  idempotency_key: string;
  status: FirstPresenceVideoStatus;
  provider: "vidu-cn-q2-pro-fast";
  provider_task_id: string | null;
  provider_state: string | null;
  input_sha256: string;
  actual_credits: number | null;
  artifact_key: string | null;
  quality_payload: FirstPresenceQualityDecision | null;
  manual_review: FirstPresenceManualReview | null;
  error_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const COLUMNS = `j.id, u.external_id AS external_user_id, j.memory_id,
  j.idempotency_key, j.status, j.provider, j.provider_task_id,
  j.provider_state, j.input_sha256, j.actual_credits, j.artifact_key,
  j.quality_payload,
  (SELECT jsonb_build_object(
    'reviewerAccount', r.reviewer_account,
    'reviewedAt', r.reviewed_at,
    'action', CASE r.decision WHEN 'approved' THEN 'approve' ELSE 'reject' END,
    'reason', r.reason_codes ->> 0
   )
   FROM public.video_generation_quality_reviews r
   WHERE r.job_id = j.id AND r.reviewer_kind = 'manual'
   ORDER BY r.created_at DESC LIMIT 1) AS manual_review,
  j.error_code, j.created_at, j.updated_at`;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function job(row: JobRow): FirstPresenceVideoJob {
  return {
    id: row.id,
    externalUserId: row.external_user_id,
    memoryId: row.memory_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    provider: row.provider,
    providerTaskId: row.provider_task_id,
    providerState: row.provider_state,
    inputSha256: row.input_sha256,
    actualCredits: row.actual_credits,
    artifactKey: row.artifact_key,
    quality: row.quality_payload,
    manualReview: row.manual_review ?? null,
    errorCode: row.error_code,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function readById(id: string): Promise<FirstPresenceVideoJob | null> {
  const result = await queryPostgres<JobRow>(
    `SELECT ${COLUMNS} FROM public.video_generation_jobs j
     JOIN public.users u ON u.id = j.user_id WHERE j.id = $1`,
    [id],
  );
  return result.rows[0] ? job(result.rows[0]) : null;
}

/** PostgreSQL source of truth for provider submission and quality settlement. */
export class FirstPresenceVideoPostgresRepository
  implements FirstPresenceVideoRepository {
  async findByIdempotencyKey(input: {
    externalUserId: string;
    memoryId: string;
    idempotencyKey: string;
  }): Promise<FirstPresenceVideoJob | null> {
    const result = await queryPostgres<JobRow>(
      `SELECT ${COLUMNS} FROM public.video_generation_jobs j
       JOIN public.users u ON u.id = j.user_id
       WHERE u.external_id = $1 AND j.memory_id = $2 AND j.idempotency_key = $3`,
      [input.externalUserId, input.memoryId, input.idempotencyKey],
    );
    return result.rows[0] ? job(result.rows[0]) : null;
  }

  findById(id: string): Promise<FirstPresenceVideoJob | null> {
    return readById(id);
  }

  async createQueued(input: CreateFirstPresenceVideoInput): Promise<FirstPresenceVideoJob> {
    return withPostgresTransaction(async (client) => {
      const owner = await client.query<{ id: string }>(
        `SELECT id FROM public.users WHERE external_id = $1 FOR KEY SHARE`,
        [input.externalUserId],
      );
      const userId = owner.rows[0]?.id;
      if (!userId) throw new Error("FIRST_PRESENCE_VIDEO_USER_NOT_FOUND");
      const memory = await client.query<{ id: string }>(
        `SELECT id FROM public.memories WHERE id = $1 AND user_id = $2 FOR KEY SHARE`,
        [input.memoryId, userId],
      );
      if (!memory.rows[0]) throw new Error("FIRST_PRESENCE_VIDEO_MEMORY_NOT_FOUND");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `memoryai:video-job:${userId}:${input.memoryId}:${input.idempotencyKey}`,
      ]);
      const found = await client.query<JobRow>(
        `SELECT ${COLUMNS} FROM public.video_generation_jobs j
         JOIN public.users u ON u.id = j.user_id
         WHERE j.user_id = $1 AND j.memory_id = $2 AND j.idempotency_key = $3 FOR UPDATE`,
        [userId, input.memoryId, input.idempotencyKey],
      );
      if (found.rows[0]) {
        if (found.rows[0].input_sha256 !== input.imageSha256) {
          throw new Error("FIRST_PRESENCE_VIDEO_IDEMPOTENCY_CONFLICT");
        }
        return job(found.rows[0]);
      }
      const inserted = await client.query<JobRow>(
        `INSERT INTO public.video_generation_jobs (user_id, memory_id, idempotency_key, input_sha256)
         VALUES ($1, $2, $3, $4)
         RETURNING id, $5::text AS external_user_id, memory_id, idempotency_key, status,
           provider, provider_task_id, provider_state, input_sha256, actual_credits,
           artifact_key, quality_payload, error_code, created_at, updated_at`,
        [userId, input.memoryId, input.idempotencyKey, input.imageSha256, input.externalUserId],
      );
      return job(inserted.rows[0]);
    });
  }

  async claimSubmission(id: string): Promise<FirstPresenceVideoJob | null> {
    const result = await queryPostgres<JobRow>(
      `WITH claimed AS (
         UPDATE public.video_generation_jobs
         SET status = 'submitting', provider_submission_state = 'submitting'
         WHERE id = $1 AND status = 'queued'
         RETURNING *
       ) SELECT claimed.id, u.external_id AS external_user_id, claimed.memory_id,
         claimed.idempotency_key, claimed.status, claimed.provider, claimed.provider_task_id,
         claimed.provider_state, claimed.input_sha256, claimed.actual_credits, claimed.artifact_key,
         claimed.quality_payload, claimed.error_code, claimed.created_at, claimed.updated_at
       FROM claimed JOIN public.users u ON u.id = claimed.user_id`,
      [id],
    );
    return result.rows[0] ? job(result.rows[0]) : null;
  }

  async markReserved(id: string): Promise<FirstPresenceVideoJob> {
    return withPostgresTransaction(async (client) => {
      const result = await client.query<JobRow>(
        `UPDATE public.video_generation_jobs j
         SET reservation_id = r.id
         FROM public.commerce_generation_reservations r
         WHERE j.id = $1 AND r.user_id = j.user_id AND r.memory_id = j.memory_id
           AND r.request_key = j.idempotency_key AND r.status = 'reserved'
         RETURNING j.id, (SELECT external_id FROM public.users WHERE id = j.user_id) AS external_user_id,
           j.memory_id, j.idempotency_key, j.status, j.provider, j.provider_task_id,
           j.provider_state, j.input_sha256, j.actual_credits, j.artifact_key,
           j.quality_payload, j.error_code, j.created_at, j.updated_at`,
        [id],
      );
      if (!result.rows[0]) throw new Error("FIRST_PRESENCE_VIDEO_RESERVATION_NOT_FOUND");
      return job(result.rows[0]);
    });
  }

  async markSubmitted(input: { id: string; providerTaskId: string; providerState: string; actualCredits: number | null }): Promise<FirstPresenceVideoJob> {
    return this.update(input.id, `status = 'submitted', provider_submission_state = 'accepted', provider_task_id = $2, provider_state = $3, actual_credits = $4`, [input.providerTaskId, input.providerState, input.actualCredits]);
  }

  async markRunning(input: { id: string; providerState: string; actualCredits: number | null }): Promise<FirstPresenceVideoJob> {
    return this.update(input.id, `status = 'running', provider_state = $2, actual_credits = $3`, [input.providerState, input.actualCredits]);
  }

  async markQualityPending(input: { id: string; providerState: string; actualCredits: number | null }): Promise<FirstPresenceVideoJob> {
    return this.update(input.id, `status = 'quality_pending', provider_state = $2, actual_credits = $3`, [input.providerState, input.actualCredits]);
  }

  async markSubmissionUncertain(input: { id: string; errorCode: string }): Promise<FirstPresenceVideoJob> {
    return this.update(input.id, `status = 'submission_uncertain', provider_submission_state = 'uncertain', error_code = $2`, [input.errorCode]);
  }

  async markFailed(input: { id: string; providerState: string | null; actualCredits: number | null; errorCode: string }): Promise<FirstPresenceVideoJob> {
    return this.update(input.id, `status = 'failed', provider_state = $2, actual_credits = $3, error_code = $4, entitlement_settlement = 'released'`, [input.providerState, input.actualCredits, input.errorCode]);
  }

  async markManualReviewRequired(input: {
    id: string;
    providerState: string;
    actualCredits: number | null;
    artifactKey: string;
    quality: FirstPresenceQualityDecision;
  }): Promise<FirstPresenceVideoJob> {
    return withPostgresTransaction(async (client) => {
      await client.query(
        `INSERT INTO public.video_generation_quality_reviews
           (job_id, review_key, reviewer_kind, decision, reason_codes, quality_payload)
         VALUES ($1, $2, 'system', 'pending', $3::jsonb, $4::jsonb)
         ON CONFLICT (job_id, review_key) DO NOTHING`,
        [input.id, `media.${input.id}`, JSON.stringify(input.quality.manualReviewReasons ?? []), JSON.stringify(input.quality)],
      );
      const updated = await client.query(
        `UPDATE public.video_generation_jobs
         SET status = 'manual_review_required', provider_state = $2, actual_credits = $3,
           artifact_key = $4, quality_status = 'pending', quality_payload = $5::jsonb
         WHERE id = $1 AND status NOT IN ('succeeded', 'rejected', 'failed')
         RETURNING id`,
        [input.id, input.providerState, input.actualCredits, input.artifactKey, JSON.stringify(input.quality)],
      );
      if (!updated.rows[0]) {
        const current = await readById(input.id);
        if (current) return current;
        throw new Error("FIRST_PRESENCE_VIDEO_JOB_NOT_FOUND");
      }
      const result = await client.query<JobRow>(
        `SELECT ${COLUMNS} FROM public.video_generation_jobs j
         JOIN public.users u ON u.id = j.user_id WHERE j.id = $1`,
        [input.id],
      );
      if (!result.rows[0]) throw new Error("FIRST_PRESENCE_VIDEO_JOB_NOT_FOUND");
      return job(result.rows[0]);
    });
  }

  async markRejected(input: {
    id: string;
    providerState: string | null;
    actualCredits: number | null;
    artifactKey: string | null;
    quality: FirstPresenceQualityDecision | null;
    errorCode: string;
    manualReview?: FirstPresenceManualReview;
  }): Promise<FirstPresenceVideoJob> {
    return this.finishWithReview(input, "rejected", "released");
  }

  async markSucceeded(input: {
    id: string;
    providerState: string;
    actualCredits: number | null;
    artifactKey: string;
    quality: FirstPresenceQualityDecision;
    manualReview: FirstPresenceManualReview;
  }): Promise<FirstPresenceVideoJob> {
    return this.finishWithReview(input, "succeeded", "committed");
  }

  private async finishWithReview(
    input: {
      id: string;
      providerState: string | null;
      actualCredits: number | null;
      artifactKey: string | null;
      quality: FirstPresenceQualityDecision | null;
      errorCode?: string;
      manualReview?: FirstPresenceManualReview;
    },
    status: "succeeded" | "rejected",
    settlement: "committed" | "released",
  ): Promise<FirstPresenceVideoJob> {
    return withPostgresTransaction(async (client) => {
      const manual = input.manualReview;
      const decision = manual
        ? manual.action === "approve" ? "approved" : "rejected"
        : status === "succeeded" ? "approved" : "rejected";
      const reviewKey = manual
        ? `manual.${input.id}.${Date.parse(manual.reviewedAt)}`
        : `quality.${input.id}`;
      const reasons = manual ? [manual.reason] : input.quality?.reasons ?? [];
      await client.query(
        `INSERT INTO public.video_generation_quality_reviews
           (job_id, review_key, reviewer_kind, reviewer_account, reviewed_at, decision, reason_codes, quality_payload)
         VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7::jsonb, $8::jsonb)
         ON CONFLICT (job_id, review_key) DO NOTHING`,
        [
          input.id,
          reviewKey,
          manual ? "manual" : "system",
          manual?.reviewerAccount ?? null,
          manual?.reviewedAt ?? null,
          decision,
          JSON.stringify(reasons),
          JSON.stringify({ quality: input.quality, manualReview: manual ?? null }),
        ],
      );
      const updated = await client.query(
        `UPDATE public.video_generation_jobs
         SET status = $2, provider_state = $3, actual_credits = $4, artifact_key = $5,
           quality_status = $6, quality_payload = $7::jsonb, error_code = $8,
           entitlement_settlement = $9
         WHERE id = $1 AND status NOT IN ('succeeded', 'rejected', 'failed')
         RETURNING id`,
        [input.id, status, input.providerState, input.actualCredits, input.artifactKey, decision, JSON.stringify(input.quality), input.errorCode ?? null, settlement],
      );
      if (!updated.rows[0]) {
        const current = await readById(input.id);
        if (current) return current;
        throw new Error("FIRST_PRESENCE_VIDEO_JOB_NOT_FOUND");
      }
      const result = await client.query<JobRow>(
        `SELECT ${COLUMNS} FROM public.video_generation_jobs j
         JOIN public.users u ON u.id = j.user_id WHERE j.id = $1`,
        [input.id],
      );
      if (!result.rows[0]) throw new Error("FIRST_PRESENCE_VIDEO_JOB_NOT_FOUND");
      return job(result.rows[0]);
    });
  }

  private async update(id: string, set: string, values: unknown[]): Promise<FirstPresenceVideoJob> {
    const result = await queryPostgres<JobRow>(
      `UPDATE public.video_generation_jobs j SET ${set}
       WHERE j.id = $1 AND j.status NOT IN ('succeeded', 'rejected', 'failed')
       RETURNING j.id, (SELECT external_id FROM public.users WHERE id = j.user_id) AS external_user_id,
         j.memory_id, j.idempotency_key, j.status, j.provider, j.provider_task_id,
         j.provider_state, j.input_sha256, j.actual_credits, j.artifact_key,
         j.quality_payload, j.error_code, j.created_at, j.updated_at`,
      [id, ...values],
    );
    if (result.rows[0]) return job(result.rows[0]);
    const current = await readById(id);
    if (current) return current;
    throw new Error("FIRST_PRESENCE_VIDEO_JOB_NOT_FOUND");
  }
}

/** Adapter only delegates reserve/settle to Migration 014; it owns no credit data. */
export class FirstPresenceCommerceEntitlementPort implements FirstPresenceEntitlementPort {
  constructor(private readonly commerce: CommerceDataSource = new CommercePostgresDataSource()) {}

  async reserve(input: { externalUserId: string; memoryId: string; idempotencyKey: string }): Promise<"reserved" | "duplicate" | "unavailable"> {
    try {
      const current = await this.commerce.recoverGeneration(input.externalUserId, input.idempotencyKey);
      if (current) return current.status === "reserved" ? "duplicate" : "duplicate";
      await this.commerce.reserveGeneration({
        externalUserId: input.externalUserId,
        memoryId: input.memoryId,
        requestKey: input.idempotencyKey,
        generationKey: `video.${input.idempotencyKey}`,
        purpose: "new_video",
      });
      return "reserved";
    } catch (error) {
      if (error instanceof CommerceStateError && error.message.includes("GENERATION_CREDIT_UNAVAILABLE")) return "unavailable";
      throw error;
    }
  }

  release(input: { externalUserId: string; memoryId: string; idempotencyKey: string; outcome?: "system_failed" | "invalidated" }): Promise<void> {
    return this.settle(input, input.outcome ?? "system_failed");
  }

  commit(input: { externalUserId: string; memoryId: string; idempotencyKey: string }): Promise<void> {
    return this.settle(input, "succeeded");
  }

  private async settle(input: { externalUserId: string; idempotencyKey: string }, outcome: GenerationSettlementOutcome): Promise<void> {
    await this.commerce.settleGeneration({ externalUserId: input.externalUserId, requestKey: input.idempotencyKey, outcome });
  }
}
