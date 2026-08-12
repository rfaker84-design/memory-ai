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

export const COMPANION_MOTION_PACK_VERSION = 1;
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
  constructor(readonly code: "MEMORY_NOT_FOUND" | "ACTIVE_ENTITLEMENT_REQUIRED" | "PHOTO_PRECONDITION_REQUIRED" | "INPUT_STAGING_UNAVAILABLE") {
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
  status: FirstPresenceVideoStatus;
  artifact_key: string | null;
  quality_status: "pending" | "approved" | "rejected";
};

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
        const current = await this.readSlots(client, entitlement.userId, input.memoryId);
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

        for (const variant of missing) {
          const jobId = randomUUID();
          await staging.stage({ jobId, storageKey: portrait.rows[0].storage_key });
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
              `companion-motion.v${COMPANION_MOTION_PACK_VERSION}.${variant}`,
              portrait.rows[0].sha256,
              variant,
              COMPANION_MOTION_PACK_VERSION,
            ],
          );
        }
        return slots(await this.readSlots(client, entitlement.userId, input.memoryId));
      }, {
        preserveError: (error) => error instanceof CompanionMotionPackError,
      });
    } catch (error) {
      await Promise.all(stagedJobIds.map((jobId) => staging.discard({ jobId }).catch(() => undefined)));
      if (error instanceof CompanionMotionPackError) throw error;
      throw new CompanionMotionPackError("INPUT_STAGING_UNAVAILABLE");
    }
  }

  async list(input: { externalUserId: string; memoryId: string }): Promise<CompanionMotionSlot[]> {
    const result = await queryPostgres<SlotRow>(
      `SELECT j.id, j.motion_variant, j.status, j.artifact_key, j.quality_status
       FROM public.video_generation_jobs j
       JOIN public.users u ON u.id = j.user_id
       WHERE u.external_id = $1 AND j.memory_id = $2::uuid
         AND j.use_case = 'companion_micro_motion' AND j.pack_version = $3
         AND public.memoryai_companion_motion_eligible(j.user_id, j.memory_id, $4)
       ORDER BY j.motion_variant`,
      [
        input.externalUserId,
        input.memoryId,
        COMPANION_MOTION_PACK_VERSION,
        companionMotionStagingReviewEnabled(this.environment),
      ],
    );
    return slots(result.rows);
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
      `SELECT id, motion_variant, status, artifact_key, quality_status
       FROM public.video_generation_jobs
       WHERE user_id = $1 AND memory_id = $2::uuid
         AND use_case = 'companion_micro_motion' AND pack_version = $3
       ORDER BY motion_variant`,
      [userId, memoryId, COMPANION_MOTION_PACK_VERSION],
    );
    return result.rows;
  }
}
