import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import {
  queryPostgres,
  withPostgresTransaction,
} from "../../src/server/database";
import type { OwnerVideoInputStagingPort } from "./first-presence-video-owner-api";
import type {
  CompanionMotionEntitlementPort,
  CompanionMotionVariant,
  FirstPresenceVideoStatus,
} from "./first-presence-video-service";

/**
 * Version 2 uses a private derived 9:16 provider input. Version 1 assets are
 * retained for existing owners; only a v1 resolution rejection advances a
 * person to this version, so failed work never turns into automatic retries.
 */
export const COMPANION_MOTION_PACK_VERSION = 2;
/**
 * A single, staging-only visual-review replacement for the v2 idle clip.  It
 * intentionally does not advance the paid-pack version: attentive and
 * reflective keep their approved v2 assets and a review cannot fan out into a
 * second three-video purchase.
 */
export const COMPANION_MOTION_IDLE_VISUAL_REVIEW_VERSION = 3;
/**
 * The Owner-approved idle sample is the visual baseline. This independent,
 * staging-only attentive sample advances only the attentive slot, so it can
 * never fan out into another idle or reflective submission.
 */
export const COMPANION_MOTION_ATTENTIVE_VISUAL_REVIEW_VERSION = 5;
/**
 * A single, stricter staging-only attentive replacement. It is intentionally
 * distinct from the rejected v5 visual so the operator can create exactly one
 * new native Provider task without mutating or retrying the previous work.
 */
export const COMPANION_MOTION_ATTENTIVE_STILL_VISUAL_REVIEW_VERSION = 6;
export const COMPANION_MOTION_VARIANTS = [
  "idle",
  "attentive",
  "reflective",
] as const satisfies readonly CompanionMotionVariant[];

export type CompanionMotionSlot = {
  jobId: string;
  variant: CompanionMotionVariant;
  status: FirstPresenceVideoStatus;
  artifactAvailable: boolean;
};

export type CompanionMotionPackState = {
  eligible: boolean;
  slots: CompanionMotionSlot[];
};

export class CompanionMotionPackError extends Error {
  constructor(readonly code: "MEMORY_NOT_FOUND" | "ACTIVE_ENTITLEMENT_REQUIRED" | "PHOTO_PRECONDITION_REQUIRED" | "INPUT_STAGING_UNAVAILABLE" | "STAGING_REVIEW_ONLY") {
    super(code);
  }
}

export function companionMotionStagingReviewEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment.NODE_ENV === "production"
    && environment.DEPLOYMENT_ENV === "staging"
    && environment.YIJIAN_COMPANION_MOTION_STAGING_REVIEW_ENABLED === "true";
}

type SlotRow = {
  id: string;
  motion_variant: CompanionMotionVariant;
  pack_version: number;
  status: FirstPresenceVideoStatus;
  artifact_key: string | null;
  quality_status: "pending" | "approved" | "rejected";
  error_code: string | null;
};

function selectedPackVersion(rows: SlotRow[]): number {
  if (rows.length === 0) return COMPANION_MOTION_PACK_VERSION;
  if (rows.some((row) => row.pack_version === COMPANION_MOTION_PACK_VERSION)) {
    return COMPANION_MOTION_PACK_VERSION;
  }
  if (rows.some((row) => row.error_code === "MEDIA_RESOLUTION_INVALID")) {
    return COMPANION_MOTION_PACK_VERSION;
  }
  return rows.reduce((version, row) => Math.max(version, row.pack_version), 1);
}

function slots(rows: SlotRow[]): CompanionMotionSlot[] {
  return rows.map((row) => ({
    jobId: row.id,
    variant: row.motion_variant,
    status: row.status,
    artifactAvailable: row.status === "succeeded"
      && row.quality_status === "approved"
      && Boolean(row.artifact_key),
  }));
}

/**
 * A later one-off idle review must replace only idle after it is approved.
 * While it is queued or rejected, keep the existing approved v2 idle clip
 * visible instead of making the person appear static or dropping the other
 * two variants from the owner pack.
 */
function presentationSlots(rows: SlotRow[]): CompanionMotionSlot[] {
  return COMPANION_MOTION_VARIANTS.flatMap((variant) => {
    const candidates = rows
      .filter((row) => row.motion_variant === variant)
      .sort((left, right) => right.pack_version - left.pack_version);
    const approved = candidates.find((row) => (
      row.status === "succeeded" && row.quality_status === "approved" && Boolean(row.artifact_key)
    ));
    const selected = approved ?? candidates[0];
    return selected ? slots([selected]) : [];
  });
}

async function eligibleOwner(
  client: PoolClient,
  externalUserId: string,
  memoryId: string,
  allowStagingReview: boolean,
): Promise<{ userId: string } | null> {
  const result = await client.query<{ user_id: string }>(
    `SELECT m.user_id
     FROM public.memories m
     JOIN public.users u ON u.id = m.user_id
     WHERE u.external_id = $1
       AND m.id = $2::uuid
       AND public.memoryai_companion_motion_eligible(m.user_id, m.id, $3)
     LIMIT 1
     FOR KEY SHARE OF m`,
    [externalUserId, memoryId, allowStagingReview],
  );
  return result.rows[0] ? { userId: result.rows[0].user_id } : null;
}

/** Worker-side paid entitlement guard. It neither spends nor reserves a video credit. */
export class PostgresCompanionMotionEntitlementPort implements CompanionMotionEntitlementPort {
  constructor(private readonly environment: Record<string, string | undefined> = process.env) {}

  async assertActive(input: { externalUserId: string; memoryId: string }): Promise<void> {
    const result = await queryPostgres(
      `SELECT 1
       FROM public.memories m
       JOIN public.users u ON u.id = m.user_id
       WHERE u.external_id = $1 AND m.id = $2::uuid
         AND public.memoryai_companion_motion_eligible(m.user_id, m.id, $3)
       LIMIT 1`,
      [
        input.externalUserId,
        input.memoryId,
        companionMotionStagingReviewEnabled(this.environment),
      ],
    );
    if (!result.rows[0]) throw new CompanionMotionPackError("ACTIVE_ENTITLEMENT_REQUIRED");
  }
}

/**
 * Creates only missing durable slots. The partial unique index is the final
 * concurrency guard, while the advisory lock avoids duplicate input staging.
 */
export class CompanionMotionPackService {
  constructor(
    private readonly createInputStaging: () => OwnerVideoInputStagingPort,
    private readonly environment: Record<string, string | undefined> = process.env,
  ) {}

  async ensure(input: { externalUserId: string; memoryId: string }): Promise<CompanionMotionSlot[]> {
    const stagedJobIds: string[] = [];
    const staging = this.createInputStaging();
    try {
      return await withPostgresTransaction(async (client) => {
        const entitlement = await eligibleOwner(
          client,
          input.externalUserId,
          input.memoryId,
          companionMotionStagingReviewEnabled(this.environment),
        );
        if (!entitlement) throw new CompanionMotionPackError("ACTIVE_ENTITLEMENT_REQUIRED");
        const memory = await client.query<{ id: string }>(
          `SELECT id FROM public.memories
           WHERE id = $1::uuid AND user_id = $2
           FOR KEY SHARE`,
          [input.memoryId, entitlement.userId],
        );
        if (!memory.rows[0]) throw new CompanionMotionPackError("MEMORY_NOT_FOUND");

        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          `memoryai:companion-motion:${entitlement.userId}:${input.memoryId}:${COMPANION_MOTION_PACK_VERSION}`,
        ]);
        const allSlots = await this.readSlots(client, entitlement.userId, input.memoryId);
        const packVersion = selectedPackVersion(allSlots);
        const current = allSlots.filter((slot) => slot.pack_version === packVersion);
        const present = new Set(current.map((slot) => slot.motion_variant));
        const missing = COMPANION_MOTION_VARIANTS.filter((variant) => !present.has(variant));
        if (missing.length === 0) return slots(current);

        const portrait = await client.query<{ sha256: string; storage_key: string }>(
          `SELECT sha256, storage_key
           FROM public.media_assets
           WHERE user_id = $1 AND memory_id = $2::uuid
             AND media_type = 'image' AND status = 'uploaded'
             AND deleted_at IS NULL AND storage_key IS NOT NULL AND sha256 IS NOT NULL
             AND (
               metadata ->> 'qualityPreflightStatus' = 'passed'
               OR metadata #>> '{qualityPreflight,status}' = 'passed'
               OR metadata #>> '{quality_preflight,status}' = 'passed'
             )
           ORDER BY created_at DESC, id DESC LIMIT 1 FOR KEY SHARE`,
          [entitlement.userId, input.memoryId],
        );
        if (!portrait.rows[0]) throw new CompanionMotionPackError("PHOTO_PRECONDITION_REQUIRED");

        const derived = await staging.prepareCompanionMotionInput({
          storageKey: portrait.rows[0].storage_key,
        });
        for (const variant of missing) {
          const jobId = randomUUID();
          await staging.stage({
            jobId,
            imageDataUrl: derived.imageDataUrl,
          });
          stagedJobIds.push(jobId);
          await client.query(
            `INSERT INTO public.video_generation_jobs (
               id, user_id, memory_id, idempotency_key, input_sha256,
               use_case, motion_variant, pack_version
             ) VALUES ($1, $2, $3::uuid, $4, $5, 'companion_micro_motion', $6, $7)`,
            [
              jobId,
              entitlement.userId,
              input.memoryId,
              `companion-motion.v${packVersion}.${variant}`,
              derived.inputSha256,
              variant,
              packVersion,
            ],
          );
        }
        return slots((await this.readSlots(client, entitlement.userId, input.memoryId))
          .filter((slot) => slot.pack_version === packVersion));
      }, {
        preserveError: (error) => error instanceof CompanionMotionPackError,
      });
    } catch (error) {
      await Promise.all(stagedJobIds.map((jobId) => staging.discard({ jobId }).catch(() => undefined)));
      if (error instanceof CompanionMotionPackError) throw error;
      throw new CompanionMotionPackError("INPUT_STAGING_UNAVAILABLE");
    }
  }

  /** A bounded reviewer-authorized Staging replacement for idle only. */
  async ensureIdleVisualReview(input: { externalUserId: string; memoryId: string }): Promise<CompanionMotionSlot[]> {
    return this.ensureSingleVisualReview(input, {
      variant: "idle",
      packVersion: COMPANION_MOTION_IDLE_VISUAL_REVIEW_VERSION,
      reviewKey: "idle-review",
    });
  }

  /**
   * A reviewer-authorized sustained-listening replacement for the rejected
   * v4 attentive sample. It is deliberately not a pack request and cannot
   * create idle, acknowledgement, or reflective work.
   */
  async ensureAttentiveVisualReview(input: { externalUserId: string; memoryId: string }): Promise<CompanionMotionSlot[]> {
    return this.ensureSingleVisualReview(input, {
      variant: "attentive",
      packVersion: COMPANION_MOTION_ATTENTIVE_VISUAL_REVIEW_VERSION,
      reviewKey: "attentive-sustained-review",
    });
  }

  /**
   * One reviewer-authorized, passive-listening replacement for v5. This must
   * never fan out into acknowledgement or reflective work.
   */
  async ensureAttentiveStillVisualReview(input: { externalUserId: string; memoryId: string }): Promise<CompanionMotionSlot[]> {
    return this.ensureSingleVisualReview(input, {
      variant: "attentive",
      packVersion: COMPANION_MOTION_ATTENTIVE_STILL_VISUAL_REVIEW_VERSION,
      reviewKey: "attentive-still-review",
    });
  }

  async list(input: { externalUserId: string; memoryId: string }): Promise<CompanionMotionSlot[]> {
    const result = await queryPostgres<SlotRow>(
      `SELECT j.id, j.motion_variant, j.pack_version, j.status, j.artifact_key, j.quality_status, j.error_code
       FROM public.video_generation_jobs j
       JOIN public.users u ON u.id = j.user_id
       WHERE u.external_id = $1 AND j.memory_id = $2::uuid
         AND j.use_case = 'companion_micro_motion'
         AND public.memoryai_companion_motion_eligible(j.user_id, j.memory_id, $3)
       ORDER BY j.motion_variant`,
      [
        input.externalUserId,
        input.memoryId,
        companionMotionStagingReviewEnabled(this.environment),
      ],
    );
    return presentationSlots(result.rows);
  }

  async getState(input: { externalUserId: string; memoryId: string }): Promise<CompanionMotionPackState> {
    const result = await queryPostgres<{ owned: boolean; eligible: boolean }>(
      `SELECT true AS owned,
         public.memoryai_companion_motion_eligible(m.user_id, m.id, $3) AS eligible
       FROM public.memories m
       JOIN public.users u ON u.id = m.user_id
       WHERE u.external_id = $1 AND m.id = $2::uuid`,
      [
        input.externalUserId,
        input.memoryId,
        companionMotionStagingReviewEnabled(this.environment),
      ],
    );
    const state = result.rows[0];
    if (!state?.owned) throw new CompanionMotionPackError("MEMORY_NOT_FOUND");
    return {
      eligible: state.eligible,
      slots: state.eligible ? await this.list(input) : [],
    };
  }

  private async readSlots(client: PoolClient, userId: string, memoryId: string): Promise<SlotRow[]> {
    const result = await client.query<SlotRow>(
      `SELECT id, motion_variant, pack_version, status, artifact_key, quality_status, error_code
       FROM public.video_generation_jobs
       WHERE user_id = $1 AND memory_id = $2::uuid
         AND use_case = 'companion_micro_motion'
       ORDER BY motion_variant`,
      [userId, memoryId],
    );
    return result.rows;
  }

  private async ensureSingleVisualReview(
    input: { externalUserId: string; memoryId: string },
    sample: {
      variant: "idle" | "attentive";
      packVersion: number;
      reviewKey: "idle-review" | "attentive-sustained-review" | "attentive-still-review";
    },
  ): Promise<CompanionMotionSlot[]> {
    if (!companionMotionStagingReviewEnabled(this.environment)) {
      throw new CompanionMotionPackError("STAGING_REVIEW_ONLY");
    }
    const stagedJobIds: string[] = [];
    const staging = this.createInputStaging();
    try {
      return await withPostgresTransaction(async (client) => {
        const entitlement = await eligibleOwner(client, input.externalUserId, input.memoryId, true);
        if (!entitlement) throw new CompanionMotionPackError("ACTIVE_ENTITLEMENT_REQUIRED");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          `memoryai:companion-motion-${sample.reviewKey}:${entitlement.userId}:${input.memoryId}:${sample.packVersion}`,
        ]);
        const allSlots = await this.readSlots(client, entitlement.userId, input.memoryId);
        const existing = allSlots.find((slot) => (
          slot.pack_version === sample.packVersion && slot.motion_variant === sample.variant
        ));
        if (existing) return presentationSlots(allSlots);

        const portrait = await client.query<{ sha256: string; storage_key: string }>(
          `SELECT sha256, storage_key
           FROM public.media_assets
           WHERE user_id = $1 AND memory_id = $2::uuid
             AND media_type = 'image' AND status = 'uploaded'
             AND deleted_at IS NULL AND storage_key IS NOT NULL AND sha256 IS NOT NULL
             AND (
               metadata ->> 'qualityPreflightStatus' = 'passed'
               OR metadata #>> '{qualityPreflight,status}' = 'passed'
               OR metadata #>> '{quality_preflight,status}' = 'passed'
             )
           ORDER BY created_at DESC, id DESC LIMIT 1 FOR KEY SHARE`,
          [entitlement.userId, input.memoryId],
        );
        if (!portrait.rows[0]) throw new CompanionMotionPackError("PHOTO_PRECONDITION_REQUIRED");

        const derived = await staging.prepareCompanionMotionInput({ storageKey: portrait.rows[0].storage_key });
        const jobId = randomUUID();
        await staging.stage({ jobId, imageDataUrl: derived.imageDataUrl });
        stagedJobIds.push(jobId);
        await client.query(
          `INSERT INTO public.video_generation_jobs (
             id, user_id, memory_id, idempotency_key, input_sha256,
             use_case, motion_variant, pack_version
           ) VALUES ($1, $2, $3::uuid, $4, $5, 'companion_micro_motion', $6, $7)`,
          [
            jobId,
            entitlement.userId,
            input.memoryId,
            `companion-motion.${sample.reviewKey}.v${sample.packVersion}`,
            derived.inputSha256,
            sample.variant,
            sample.packVersion,
          ],
        );
        return presentationSlots(await this.readSlots(client, entitlement.userId, input.memoryId));
      }, {
        preserveError: (error) => error instanceof CompanionMotionPackError,
      });
    } catch (error) {
      await Promise.all(stagedJobIds.map((jobId) => staging.discard({ jobId }).catch(() => undefined)));
      if (error instanceof CompanionMotionPackError) throw error;
      throw new CompanionMotionPackError("INPUT_STAGING_UNAVAILABLE");
    }
  }
}

/**
 * Bridges a settled current-Commerce paid package to the existing durable
 * companion-motion pack.  Commerce is account-scoped today, so every exact
 * non-deleted memory belonging to that paid owner is considered independently;
 * only memories with a passed portrait preflight are enqueued.  `ensure` keeps
 * the final per-memory/variant idempotency guarantee.
 */
export class PaidCompanionMotionLifecycle {
  constructor(private readonly packService: CompanionMotionPackService) {}

  async enqueueForPaidOrder(input: { orderNo: string }): Promise<void> {
    const targets = await queryPostgres<{
      external_user_id: string;
      memory_id: string;
    }>(
      `SELECT u.external_id AS external_user_id, m.id AS memory_id
       FROM public.commerce_orders o
       JOIN public.users u ON u.id = o.user_id
       JOIN public.commerce_credit_lots l
         ON l.user_id = o.user_id
        AND l.source_kind = 'paid_package'
        AND l.source_key = o.id::text
       JOIN public.memories m ON m.user_id = o.user_id
       WHERE o.order_no = $1
         AND o.status = 'paid'
         AND o.paid_at IS NOT NULL
         AND o.provider_transaction_id IS NOT NULL
         AND o.refunded_at IS NULL
         AND l.active = true
         AND l.save_allowed = true
         AND l.expires_at IS NULL
         AND m.deleted_at IS NULL
         AND EXISTS (
           SELECT 1
           FROM public.media_assets a
           WHERE a.user_id = m.user_id
             AND a.memory_id = m.id
             AND a.media_type = 'image'
             AND a.status = 'uploaded'
             AND a.deleted_at IS NULL
             AND a.storage_key IS NOT NULL
             AND a.sha256 IS NOT NULL
             AND (
               a.metadata ->> 'qualityPreflightStatus' = 'passed'
               OR a.metadata #>> '{qualityPreflight,status}' = 'passed'
               OR a.metadata #>> '{quality_preflight,status}' = 'passed'
             )
         )
       ORDER BY m.created_at ASC, m.id ASC`,
      [input.orderNo],
    );
    for (const target of targets.rows) {
      await this.packService.ensure({
        externalUserId: target.external_user_id,
        memoryId: target.memory_id,
      });
    }
  }
}
