import { queryPostgres } from "../../src/server/database";

import { companionMotionStagingReviewEnabled } from "./companion-micro-motion";
import type { VideoArtifactStoragePort } from "./video-artifact-storage";

export type ApprovedVideoArtifact = {
  jobId: string;
  memoryId: string;
  /** Internal-only storage binding. It must never cross an API DTO boundary. */
  artifactKey: string;
  playbackUrl: string;
  playbackExpiresAt: string;
  presentation: "initial_preview" | "additional_generation";
  saveAllowed: boolean;
  motionVariant?: "idle" | "attentive" | "reflective";
};

export type VideoArtifactQueryPort = {
  findApprovedForOwner(input: {
    externalUserId: string;
    memoryId: string;
    jobId: string;
    expiresInSeconds?: number;
  }): Promise<ApprovedVideoArtifact | null>;
};

export function videoArtifactPresentation(input: {
  purpose: "first_preview" | "new_video" | "photo_remedy" | "referral_experience" | "occasion_experience";
  creditLotSaveAllowed: boolean;
}): Pick<ApprovedVideoArtifact, "presentation" | "saveAllowed"> {
  const presentation = input.purpose === "first_preview" ? "initial_preview" : "additional_generation";
  return {
    presentation,
    saveAllowed: presentation === "additional_generation" && input.creditLotSaveAllowed,
  };
}

type ApprovedArtifactRow = {
  id: string;
  memory_id: string;
  artifact_key: string;
  purpose: "first_preview" | "new_video" | "photo_remedy" | "referral_experience" | "occasion_experience" | null;
  save_allowed: boolean;
  use_case: "first_presence" | "companion_micro_motion";
  motion_variant: "idle" | "attentive" | "reflective" | null;
};

/**
 * Read model for Window 4. It is deliberately owner-scoped and only projects
 * the already-approved Migration 016 job; it neither reserves nor settles
 * Commerce credit.
 */
export class FirstPresenceVideoArtifactQueryPort implements VideoArtifactQueryPort {
  constructor(
    private readonly storage: VideoArtifactStoragePort,
    private readonly environment: Record<string, string | undefined> = process.env,
  ) {}

  async findApprovedForOwner(input: {
    externalUserId: string;
    memoryId: string;
    jobId: string;
    expiresInSeconds?: number;
  }): Promise<ApprovedVideoArtifact | null> {
    const result = await queryPostgres<ApprovedArtifactRow>(
      `SELECT j.id, j.memory_id, j.artifact_key, r.purpose,
         COALESCE(l.save_allowed, false) AS save_allowed,
         j.use_case, j.motion_variant
       FROM public.video_generation_jobs j
       JOIN public.users u ON u.id = j.user_id
       LEFT JOIN public.commerce_generation_reservations r ON r.id = j.reservation_id AND r.user_id = j.user_id
       LEFT JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id AND l.user_id = j.user_id
       WHERE j.id = $1 AND u.external_id = $2 AND j.memory_id = $3
         AND j.status = 'succeeded'
         AND j.quality_status = 'approved'
         AND j.entitlement_settlement = 'committed'
          AND j.artifact_key IS NOT NULL
          AND (
            (j.use_case = 'first_presence' AND r.id IS NOT NULL AND l.id IS NOT NULL)
            OR (
              j.use_case = 'companion_micro_motion'
              AND j.motion_variant IN ('idle', 'attentive', 'reflective')
              AND public.memoryai_companion_motion_eligible(j.user_id, j.memory_id, $4)
            )
          )
         AND EXISTS (
           SELECT 1 FROM public.video_generation_quality_reviews q
           WHERE q.job_id = j.id
             AND q.reviewer_kind = 'manual'
             AND q.decision = 'approved'
         )`,
      [
        input.jobId,
        input.externalUserId,
        input.memoryId,
        companionMotionStagingReviewEnabled(this.environment),
      ],
    );
    const row = result.rows[0];
    if (!row) return null;
    const signed = await this.storage.createSignedPlaybackUrl({
      artifactKey: row.artifact_key,
      expiresInSeconds: input.expiresInSeconds ?? 300,
    });
    const presentation = row.use_case === "companion_micro_motion"
      ? { presentation: "additional_generation" as const, saveAllowed: false }
      : videoArtifactPresentation({
          purpose: row.purpose!,
          creditLotSaveAllowed: row.save_allowed,
        });
    return {
      jobId: row.id,
      memoryId: row.memory_id,
      artifactKey: row.artifact_key,
      playbackUrl: signed.url,
      playbackExpiresAt: signed.expiresAt,
      presentation: presentation.presentation,
      // Initial previews must not become a save surface merely because the
      // viewer can stream them. Later generations inherit the credited lot.
      saveAllowed: presentation.saveAllowed,
      ...(row.motion_variant ? { motionVariant: row.motion_variant } : {}),
    };
  }
}
