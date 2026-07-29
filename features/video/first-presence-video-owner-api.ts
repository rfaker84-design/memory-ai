import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import {
  queryPostgres,
  withPostgresTransaction,
} from "../../src/server/database";
import type { GenerationPurpose } from "../commerce/types";
import type {
  FirstPresenceVideoJob,
  FirstPresenceVideoStatus,
} from "./first-presence-video-service";

export type FirstPresenceVideoIntent =
  | "initial_preview"
  | "additional_generation";

export type FirstPresenceVideoSafeDto = {
  id: string;
  memoryId: string;
  intent: FirstPresenceVideoIntent;
  status: FirstPresenceVideoStatus;
  provider: "vidu-cn-q2-pro-fast";
  saveAllowed: boolean;
  artifactAvailable: boolean;
  manualReviewRequired: boolean;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OwnerVideoJob = FirstPresenceVideoJob & {
  intent: FirstPresenceVideoIntent;
  saveAllowed: boolean;
};

export type OwnerVideoJobCreateResult = {
  job: OwnerVideoJob;
  created: boolean;
};

export type CreateOwnerVideoJobInput = {
  externalUserId: string;
  memoryId: string;
  idempotencyKey: string;
  intent: FirstPresenceVideoIntent;
};

export type OwnerVideoJobCommandPort = {
  createOrRecover(input: CreateOwnerVideoJobInput): Promise<OwnerVideoJobCreateResult>;
};

export type OwnerVideoJobQueryPort = {
  listForOwner(input: {
    externalUserId: string;
    memoryId: string;
  }): Promise<OwnerVideoJob[]>;
};

export type OwnerVideoQueuePort = {
  enqueue(input: { jobId: string }): Promise<void>;
};

/**
 * The owner API must stage a verified portrait before it commits a queued row.
 * This prevents a worker in another process from claiming a job whose input
 * has not yet reached durable storage.
 */
export type OwnerVideoInputStagingPort = {
  stage(input: { jobId: string; storageKey: string }): Promise<void>;
  discard(input: { jobId: string }): Promise<void>;
};

export class FirstPresenceVideoOwnerApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

function assertRequired(value: string, field: string, pattern?: RegExp): string {
  const normalized = value.trim();
  if (!normalized || (pattern && !pattern.test(normalized))) {
    throw new FirstPresenceVideoOwnerApiError(`INVALID_${field.toUpperCase()}`);
  }
  return normalized;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

type OwnerJobRow = {
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
  quality_payload: FirstPresenceVideoJob["quality"];
  manual_review: FirstPresenceVideoJob["manualReview"];
  error_code: string | null;
  intent: FirstPresenceVideoIntent;
  save_allowed: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

const OWNER_JOB_COLUMNS = `j.id, u.external_id AS external_user_id, j.memory_id,
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
  j.error_code,
  CASE
    WHEN r.purpose = 'first_preview' THEN 'initial_preview'
    ELSE 'additional_generation'
  END AS intent,
  COALESCE(l.save_allowed, false) AS save_allowed,
  j.created_at, j.updated_at`;

function toOwnerJob(row: OwnerJobRow): OwnerVideoJob {
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
    quality: row.quality_payload ?? null,
    manualReview: row.manual_review ?? null,
    errorCode: row.error_code,
    intent: row.intent,
    saveAllowed: row.save_allowed,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toFirstPresenceVideoSafeDto(
  job: OwnerVideoJob,
): FirstPresenceVideoSafeDto {
  return {
    id: job.id,
    memoryId: job.memoryId,
    intent: job.intent,
    status: job.status,
    provider: job.provider,
    saveAllowed: job.saveAllowed,
    artifactAvailable: Boolean(job.artifactKey && job.status === "succeeded"),
    manualReviewRequired: job.status === "manual_review_required",
    errorCode: job.errorCode,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export class FirstPresenceVideoOwnerApiService {
  constructor(
    private readonly commands: OwnerVideoJobCommandPort,
    private readonly queries: OwnerVideoJobQueryPort,
    private readonly queue: OwnerVideoQueuePort,
  ) {}

  async create(input: CreateOwnerVideoJobInput): Promise<FirstPresenceVideoSafeDto> {
    const result = await this.commands.createOrRecover({
      ...input,
      externalUserId: assertRequired(input.externalUserId, "user_id"),
      memoryId: assertRequired(input.memoryId, "memory_id", UUID_PATTERN),
      idempotencyKey: assertRequired(
        input.idempotencyKey,
        "idempotency_key",
        KEY_PATTERN,
      ),
    });
    if (result.created) await this.queue.enqueue({ jobId: result.job.id });
    return toFirstPresenceVideoSafeDto(result.job);
  }

  async list(input: {
    externalUserId: string;
    memoryId: string;
  }): Promise<FirstPresenceVideoSafeDto[]> {
    const jobs = await this.queries.listForOwner({
      externalUserId: assertRequired(input.externalUserId, "user_id"),
      memoryId: assertRequired(input.memoryId, "memory_id", UUID_PATTERN),
    });
    return jobs.map(toFirstPresenceVideoSafeDto);
  }
}

async function selectedPortrait(
  client: PoolClient,
  userId: string,
  memoryId: string,
): Promise<{ sha256: string; storage_key: string } | null> {
  const result = await client.query<{ sha256: string; storage_key: string }>(
    `SELECT sha256, storage_key
     FROM public.media_assets
     WHERE user_id = $1
       AND memory_id = $2
       AND media_type = 'image'
       AND status = 'uploaded'
       AND deleted_at IS NULL
       AND storage_key IS NOT NULL
       AND sha256 IS NOT NULL
       AND (
         metadata ->> 'qualityPreflightStatus' = 'passed'
         OR metadata #>> '{qualityPreflight,status}' = 'passed'
         OR metadata #>> '{quality_preflight,status}' = 'passed'
       )
     ORDER BY created_at DESC, id DESC
     LIMIT 1
     FOR KEY SHARE`,
    [userId, memoryId],
  );
  return result.rows[0] ?? null;
}

async function assertTwoCompletedChatRounds(
  client: PoolClient,
  userId: string,
  memoryId: string,
): Promise<void> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM public.memory_chat_turns
     WHERE user_id = $1 AND memory_id = $2 AND status = 'completed'`,
    [userId, memoryId],
  );
  if (Number(result.rows[0]?.count ?? 0) < 2) {
    throw new FirstPresenceVideoOwnerApiError("TWO_CHAT_ROUNDS_REQUIRED");
  }
}

async function reserveCredit(
  client: PoolClient,
  input: {
    userId: string;
    memoryId: string;
    requestKey: string;
    generationKey: string;
    intent: FirstPresenceVideoIntent;
  },
): Promise<{
  id: string;
  purpose: GenerationPurpose;
  saveAllowed: boolean;
}> {
  const existing = await client.query<{
    id: string;
    memory_id: string;
    generation_key: string;
    purpose: GenerationPurpose;
    save_allowed: boolean;
  }>(
    `SELECT r.id, r.memory_id, r.generation_key, r.purpose, l.save_allowed
     FROM public.commerce_generation_reservations r
     JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id
     WHERE r.user_id = $1 AND r.request_key = $2
     FOR UPDATE OF r, l`,
    [input.userId, input.requestKey],
  );
  const existingReservation = existing.rows[0];
  if (existingReservation) {
    const expectedIntent = existingReservation.purpose === "first_preview"
      ? "initial_preview"
      : "additional_generation";
    if (
      existingReservation.memory_id !== input.memoryId
      || existingReservation.generation_key !== input.generationKey
      || expectedIntent !== input.intent
    ) {
      throw new FirstPresenceVideoOwnerApiError("IDEMPOTENCY_PAYLOAD_CONFLICT");
    }
    return {
      id: existingReservation.id,
      purpose: existingReservation.purpose,
      saveAllowed: existingReservation.save_allowed,
    };
  }

  if (input.intent === "initial_preview") {
    const first = await client.query<{ id: string }>(
      `SELECT id FROM public.memories
       WHERE user_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1`,
      [input.userId],
    );
    if (first.rows[0]?.id !== input.memoryId) {
      throw new FirstPresenceVideoOwnerApiError(
        "FREE_PREVIEW_ONLY_AVAILABLE_FOR_FIRST_MEMORY",
      );
    }
    const previewUsed = await client.query<{ id: string }>(
      `SELECT r.id
       FROM public.commerce_generation_reservations r
       WHERE r.user_id = $1 AND r.purpose = 'first_preview'
         AND r.request_key <> $2
         AND r.status IN ('reserved', 'consumed')
       LIMIT 1`,
      [input.userId, input.requestKey],
    );
    if (previewUsed.rows[0]) {
      throw new FirstPresenceVideoOwnerApiError("FREE_PREVIEW_ALREADY_USED");
    }
    await client.query(
      `INSERT INTO public.commerce_credit_lots (
         user_id, source_kind, source_key, total_credits, save_allowed
       ) VALUES ($1, 'free_preview', $2, 1, false)
       ON CONFLICT (source_kind, source_key) DO NOTHING`,
      [input.userId, input.userId],
    );
  }

  const sourceKinds = input.intent === "initial_preview"
    ? ["free_preview"]
    : ["paid_package", "referral_reward"];
  const selected = await client.query<{
    id: string;
    source_kind: "free_preview" | "paid_package" | "referral_reward";
    save_allowed: boolean;
  }>(
    `SELECT id, source_kind, save_allowed
     FROM public.commerce_credit_lots
     WHERE user_id = $1
       AND source_kind = ANY($2::text[])
       AND active
       AND total_credits > reserved_credits + consumed_credits
     ORDER BY
       CASE source_kind
         WHEN 'free_preview' THEN 0
         WHEN 'paid_package' THEN 1
         WHEN 'referral_reward' THEN 2
         ELSE 9
       END,
       created_at ASC,
       id ASC
     LIMIT 1
     FOR UPDATE`,
    [input.userId, sourceKinds],
  );
  const lot = selected.rows[0];
  if (!lot) {
    throw new FirstPresenceVideoOwnerApiError("GENERATION_CREDIT_UNAVAILABLE");
  }
  const purpose: GenerationPurpose = lot.source_kind === "free_preview"
    ? "first_preview"
    : lot.source_kind === "referral_reward"
      ? "referral_experience"
      : "new_video";
  await client.query(
    `UPDATE public.commerce_credit_lots
     SET reserved_credits = reserved_credits + 1, updated_at = NOW()
     WHERE id = $1`,
    [lot.id],
  );
  const inserted = await client.query<{
    id: string;
    save_allowed: boolean;
  }>(
    `WITH written AS (
       INSERT INTO public.commerce_generation_reservations (
         user_id, memory_id, credit_lot_id, request_key, generation_key, purpose
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *
     )
     SELECT written.id, l.save_allowed
     FROM written
     JOIN public.commerce_credit_lots l ON l.id = written.credit_lot_id`,
    [input.userId, input.memoryId, lot.id, input.requestKey, input.generationKey, purpose],
  );
  return {
    id: inserted.rows[0].id,
    purpose,
    saveAllowed: inserted.rows[0].save_allowed,
  };
}

export class FirstPresenceVideoOwnerPostgresPort
  implements OwnerVideoJobCommandPort, OwnerVideoJobQueryPort {
  constructor(
    private readonly createInputStaging: () => OwnerVideoInputStagingPort,
  ) {}

  async createOrRecover(
    input: CreateOwnerVideoJobInput,
  ): Promise<OwnerVideoJobCreateResult> {
    const externalUserId = assertRequired(input.externalUserId, "user_id");
    const memoryId = assertRequired(input.memoryId, "memory_id", UUID_PATTERN);
    const requestKey = assertRequired(
      input.idempotencyKey,
      "idempotency_key",
      KEY_PATTERN,
    );

    return withPostgresTransaction(async (client) => {
      const user = await client.query<{ id: string }>(
        `SELECT id FROM public.users WHERE external_id = $1 FOR UPDATE`,
        [externalUserId],
      );
      const userId = user.rows[0]?.id;
      if (!userId) throw new FirstPresenceVideoOwnerApiError("MEMORY_NOT_FOUND");
      const memory = await client.query<{ id: string }>(
        `SELECT id FROM public.memories
         WHERE id = $1 AND user_id = $2
         FOR KEY SHARE`,
        [memoryId, userId],
      );
      if (!memory.rows[0]) {
        throw new FirstPresenceVideoOwnerApiError("MEMORY_NOT_FOUND");
      }
      const memoryCount = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public.memories WHERE user_id = $1`,
        [userId],
      );
      if (Number(memoryCount.rows[0]?.count ?? 0) > 3) {
        throw new FirstPresenceVideoOwnerApiError("TA_LIMIT_EXCEEDED");
      }

      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `memoryai:owner-video:${userId}:${memoryId}:${requestKey}`,
      ]);

      const existing = await this.readByRequestInTransaction(
        client,
        userId,
        memoryId,
        requestKey,
        true,
      );
      if (existing) {
        if (existing.intent !== input.intent) {
          throw new FirstPresenceVideoOwnerApiError("IDEMPOTENCY_PAYLOAD_CONFLICT");
        }
        return { job: existing, created: false };
      }

      const portrait = await selectedPortrait(client, userId, memoryId);
      if (!portrait) {
        throw new FirstPresenceVideoOwnerApiError("PHOTO_PRECONDITION_REQUIRED");
      }
      if (input.intent === "additional_generation") {
        await assertTwoCompletedChatRounds(client, userId, memoryId);
      }

      const reservation = await reserveCredit(client, {
        userId,
        memoryId,
        requestKey,
        generationKey: requestKey,
        intent: input.intent,
      });
      const jobId = randomUUID();
      const inputStaging = this.createInputStaging();
      try {
        await inputStaging.stage({ jobId, storageKey: portrait.storage_key });
        const inserted = await client.query<OwnerJobRow>(
          `WITH written AS (
             INSERT INTO public.video_generation_jobs (
               id, user_id, memory_id, reservation_id, idempotency_key, input_sha256
             ) VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *
           )
           SELECT ${OWNER_JOB_COLUMNS.replaceAll("j.", "written.")}
           FROM written
           JOIN public.users u ON u.id = written.user_id
           JOIN public.commerce_generation_reservations r ON r.id = written.reservation_id
           JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id`,
          [jobId, userId, memoryId, reservation.id, requestKey, portrait.sha256],
        );
        return { job: toOwnerJob(inserted.rows[0]), created: true };
      } catch (error) {
        await inputStaging.discard({ jobId }).catch(() => undefined);
        if (error instanceof FirstPresenceVideoOwnerApiError) throw error;
        throw new FirstPresenceVideoOwnerApiError("VIDEO_INPUT_STAGING_UNAVAILABLE");
      }
    });
  }

  async listForOwner(input: {
    externalUserId: string;
    memoryId: string;
  }): Promise<OwnerVideoJob[]> {
    const externalUserId = assertRequired(input.externalUserId, "user_id");
    const memoryId = assertRequired(input.memoryId, "memory_id", UUID_PATTERN);
    const result = await queryPostgres<OwnerJobRow>(
      `SELECT ${OWNER_JOB_COLUMNS}
       FROM public.video_generation_jobs j
       JOIN public.users u ON u.id = j.user_id
       JOIN public.commerce_generation_reservations r ON r.id = j.reservation_id
       JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id
       WHERE u.external_id = $1 AND j.memory_id = $2
       ORDER BY j.created_at DESC, j.id DESC`,
      [externalUserId, memoryId],
    );
    return result.rows.map(toOwnerJob);
  }

  private async readByRequestInTransaction(
    client: PoolClient,
    userId: string,
    memoryId: string,
    requestKey: string,
    lock: boolean,
  ): Promise<OwnerVideoJob | null> {
    const result = await client.query<OwnerJobRow>(
      `SELECT ${OWNER_JOB_COLUMNS}
       FROM public.video_generation_jobs j
       JOIN public.users u ON u.id = j.user_id
       JOIN public.commerce_generation_reservations r ON r.id = j.reservation_id
       JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id
       WHERE j.user_id = $1 AND j.memory_id = $2 AND j.idempotency_key = $3
       ${lock ? "FOR UPDATE OF j, r, l" : ""}`,
      [userId, memoryId, requestKey],
    );
    return result.rows[0] ? toOwnerJob(result.rows[0]) : null;
  }
}

export class NoopFirstPresenceVideoQueuePort implements OwnerVideoQueuePort {
  async enqueue(): Promise<void> {
    // HTTP creates durable work only. A separate worker consumes queued rows via
    // the video job query port and performs provider submission/recovery.
  }
}
