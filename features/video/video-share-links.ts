import { queryPostgres } from "@/src/server/database";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PublicVideoShareLink = {
  publicId: string;
  title: string;
  jobId: string;
  memoryId: string;
  /** Server-only. It must never be returned by a public route. */
  artifactKey: string;
};

export type OwnerVideoShareLink = Omit<PublicVideoShareLink, "artifactKey"> & {
  revokedAt: string | null;
  watermarkDownloadEnabled: boolean;
};

export class VideoShareLinkError extends Error {
  constructor(readonly code: "INVALID_SHARE_REQUEST" | "SHARE_NOT_AVAILABLE") {
    super(code);
  }
}

function assertUuid(value: string): void {
  if (!UUID.test(value)) throw new VideoShareLinkError("INVALID_SHARE_REQUEST");
}

function normalizeTitle(value: string): string {
  const title = value.trim();
  if (!title || title.length > 80) throw new VideoShareLinkError("INVALID_SHARE_REQUEST");
  return title;
}

/**
 * Migration 021's only data access path.  It joins the approved, manually
 * reviewed job on every read, so a link does not become a second media
 * capability and a revoked or no-longer-approved job cannot be played.
 */
export class VideoShareLinksPostgres {
  async listForOwner(input: { externalUserId: string; memoryId: string }): Promise<OwnerVideoShareLink[]> {
    assertUuid(input.memoryId);
    const result = await queryPostgres<{
      public_id: string; title: string; video_job_id: string; memory_id: string; revoked_at: Date | null; watermark_download_enabled: boolean;
    }>(
      `SELECT s.public_id, s.title, s.video_job_id, s.memory_id, s.revoked_at, s.watermark_download_enabled
       FROM public.video_share_links s JOIN public.users u ON u.id = s.user_id
       WHERE u.external_id = $1 AND s.memory_id = $2::uuid AND s.revoked_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM public.content_visibility_holds h WHERE h.status='hidden' AND (h.memory_id=s.memory_id OR h.video_job_id=s.video_job_id OR h.share_link_id=s.id))
       ORDER BY s.created_at DESC`,
      [input.externalUserId, input.memoryId],
    );
    return result.rows.map((row) => ({
      publicId: row.public_id, title: row.title, jobId: row.video_job_id, memoryId: row.memory_id,
      revokedAt: row.revoked_at?.toISOString() ?? null, watermarkDownloadEnabled: row.watermark_download_enabled,
    }));
  }

  async createForOwner(input: {
    externalUserId: string;
    memoryId: string;
    jobId: string;
    title: string;
  }): Promise<OwnerVideoShareLink> {
    assertUuid(input.memoryId);
    assertUuid(input.jobId);
    const title = normalizeTitle(input.title);
    const result = await queryPostgres<{
      public_id: string; title: string; video_job_id: string; memory_id: string; revoked_at: Date | null; watermark_download_enabled: boolean;
    }>(
      `WITH approved AS (
         SELECT j.id, j.memory_id, j.user_id
         FROM public.video_generation_jobs j
         JOIN public.users u ON u.id = j.user_id
         JOIN public.commerce_generation_reservations r ON r.id = j.reservation_id AND r.user_id = j.user_id
         JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id AND l.user_id = j.user_id
         WHERE u.external_id = $1 AND j.memory_id = $2::uuid AND j.id = $3::uuid
           AND j.status = 'succeeded' AND j.quality_status = 'approved'
           AND j.entitlement_settlement = 'committed' AND j.artifact_key IS NOT NULL
           AND r.purpose <> 'first_preview' AND l.save_allowed = TRUE
           AND NOT EXISTS (SELECT 1 FROM public.content_visibility_holds h WHERE h.status='hidden' AND (h.memory_id=j.memory_id OR h.video_job_id=j.id))
           AND EXISTS (SELECT 1 FROM public.video_generation_quality_reviews q
             WHERE q.job_id = j.id AND q.reviewer_kind = 'manual' AND q.decision = 'approved')
       )
       INSERT INTO public.video_share_links (user_id, memory_id, video_job_id, title)
       SELECT user_id, memory_id, id, $4 FROM approved
       ON CONFLICT (video_job_id) WHERE revoked_at IS NULL
       DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
       RETURNING public_id, title, video_job_id, memory_id, revoked_at, watermark_download_enabled`,
      [input.externalUserId, input.memoryId, input.jobId, title],
    );
    const row = result.rows[0];
    if (!row) throw new VideoShareLinkError("SHARE_NOT_AVAILABLE");
    return {
      publicId: row.public_id,
      title: row.title,
      jobId: row.video_job_id,
      memoryId: row.memory_id,
      revokedAt: row.revoked_at?.toISOString() ?? null,
      watermarkDownloadEnabled: row.watermark_download_enabled,
    };
  }

  async revokeForOwner(input: { externalUserId: string; memoryId: string; publicId: string }): Promise<boolean> {
    assertUuid(input.memoryId);
    assertUuid(input.publicId);
    const result = await queryPostgres<{ public_id: string }>(
      `UPDATE public.video_share_links s SET revoked_at = COALESCE(s.revoked_at, NOW()), updated_at = NOW()
       FROM public.users u
       WHERE s.user_id = u.id AND u.external_id = $1 AND s.memory_id = $2::uuid AND s.public_id = $3::uuid
       RETURNING s.public_id`,
      [input.externalUserId, input.memoryId, input.publicId],
    );
    return result.rowCount === 1;
  }

  async setWatermarkDownloadForOwner(input: { externalUserId: string; memoryId: string; publicId: string; enabled: boolean }): Promise<OwnerVideoShareLink | null> {
    assertUuid(input.memoryId);
    assertUuid(input.publicId);
    const result = await queryPostgres<{
      public_id: string; title: string; video_job_id: string; memory_id: string; revoked_at: Date | null; watermark_download_enabled: boolean;
    }>(
      `UPDATE public.video_share_links s
       SET watermark_download_enabled = $4::boolean, updated_at = NOW()
       FROM public.users u
       WHERE s.user_id = u.id AND u.external_id = $1 AND s.memory_id = $2::uuid AND s.public_id = $3::uuid
         AND s.revoked_at IS NULL
         AND ($4::boolean = FALSE OR EXISTS (
           SELECT 1
           FROM public.video_generation_jobs j
           JOIN public.commerce_generation_reservations r ON r.id = j.reservation_id AND r.user_id = j.user_id
           JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id AND l.user_id = j.user_id
           WHERE j.id = s.video_job_id AND j.user_id = s.user_id AND j.memory_id = s.memory_id
             AND j.status = 'succeeded' AND j.quality_status = 'approved'
             AND j.entitlement_settlement = 'committed' AND j.artifact_key IS NOT NULL
             AND r.purpose <> 'first_preview' AND l.save_allowed = TRUE
             AND NOT EXISTS (SELECT 1 FROM public.content_visibility_holds h WHERE h.status='hidden' AND (h.memory_id=s.memory_id OR h.video_job_id=j.id OR h.share_link_id=s.id))
             AND EXISTS (SELECT 1 FROM public.video_generation_quality_reviews q WHERE q.job_id = j.id AND q.reviewer_kind = 'manual' AND q.decision = 'approved')
         ))
       RETURNING s.public_id, s.title, s.video_job_id, s.memory_id, s.revoked_at, s.watermark_download_enabled`,
      [input.externalUserId, input.memoryId, input.publicId, input.enabled],
    );
    const row = result.rows[0];
    return row ? {
      publicId: row.public_id, title: row.title, jobId: row.video_job_id, memoryId: row.memory_id,
      revokedAt: row.revoked_at?.toISOString() ?? null, watermarkDownloadEnabled: row.watermark_download_enabled,
    } : null;
  }

  async findWatermarkedDownloadForOwner(input: { externalUserId: string; memoryId: string; publicId: string }): Promise<PublicVideoShareLink | null> {
    assertUuid(input.memoryId);
    assertUuid(input.publicId);
    const result = await queryPostgres<{
      public_id: string; title: string; id: string; memory_id: string; artifact_key: string;
    }>(
      `SELECT s.public_id, s.title, j.id, j.memory_id, j.artifact_key
       FROM public.video_share_links s
       JOIN public.users u ON u.id = s.user_id
       JOIN public.video_generation_jobs j ON j.id = s.video_job_id AND j.user_id = s.user_id AND j.memory_id = s.memory_id
       JOIN public.commerce_generation_reservations r ON r.id = j.reservation_id AND r.user_id = j.user_id
       JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id AND l.user_id = j.user_id
       WHERE u.external_id = $1 AND s.memory_id = $2::uuid AND s.public_id = $3::uuid
         AND s.revoked_at IS NULL AND s.watermark_download_enabled = TRUE
         AND j.status = 'succeeded' AND j.quality_status = 'approved'
         AND j.entitlement_settlement = 'committed' AND j.artifact_key IS NOT NULL
         AND r.purpose <> 'first_preview' AND l.save_allowed = TRUE
         AND NOT EXISTS (SELECT 1 FROM public.content_visibility_holds h WHERE h.status='hidden' AND (h.memory_id=s.memory_id OR h.video_job_id=j.id OR h.share_link_id=s.id))
         AND EXISTS (SELECT 1 FROM public.video_generation_quality_reviews q WHERE q.job_id = j.id AND q.reviewer_kind = 'manual' AND q.decision = 'approved')`,
      [input.externalUserId, input.memoryId, input.publicId],
    );
    const row = result.rows[0];
    return row ? { publicId: row.public_id, title: row.title, jobId: row.id, memoryId: row.memory_id, artifactKey: row.artifact_key } : null;
  }

  async recordWatermarkedDownload(input: { externalUserId: string; memoryId: string; publicId: string; sha256: string; byteLength: number }): Promise<boolean> {
    assertUuid(input.memoryId);
    assertUuid(input.publicId);
    if (!/^[a-f0-9]{64}$/i.test(input.sha256) || !Number.isSafeInteger(input.byteLength) || input.byteLength < 1) {
      throw new VideoShareLinkError("INVALID_SHARE_REQUEST");
    }
    const result = await queryPostgres<{ id: string }>(
      `INSERT INTO public.audit_logs (user_id, memory_id, action, level, message, metadata)
       SELECT s.user_id, s.memory_id, 'video_share.watermarked_download', 'info', 'Owner downloaded an ephemeral watermarked video',
              jsonb_build_object('publicShareId', s.public_id, 'videoJobId', s.video_job_id, 'sha256', $4, 'byteLength', $5, 'derivative', 'ephemeral')
       FROM public.video_share_links s
       JOIN public.users u ON u.id = s.user_id
       JOIN public.video_generation_jobs j ON j.id = s.video_job_id AND j.user_id = s.user_id AND j.memory_id = s.memory_id
       JOIN public.commerce_generation_reservations r ON r.id = j.reservation_id AND r.user_id = j.user_id
       JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id AND l.user_id = j.user_id
       WHERE u.external_id = $1 AND s.memory_id = $2::uuid AND s.public_id = $3::uuid
         AND s.revoked_at IS NULL AND s.watermark_download_enabled = TRUE
         AND j.status = 'succeeded' AND j.quality_status = 'approved'
         AND j.entitlement_settlement = 'committed' AND j.artifact_key IS NOT NULL
         AND r.purpose <> 'first_preview' AND l.save_allowed = TRUE
         AND NOT EXISTS (SELECT 1 FROM public.content_visibility_holds h WHERE h.status='hidden' AND (h.memory_id=s.memory_id OR h.video_job_id=j.id OR h.share_link_id=s.id))
         AND EXISTS (SELECT 1 FROM public.video_generation_quality_reviews q WHERE q.job_id = j.id AND q.reviewer_kind = 'manual' AND q.decision = 'approved')
       RETURNING id`,
      [input.externalUserId, input.memoryId, input.publicId, input.sha256, input.byteLength],
    );
    return result.rowCount === 1;
  }

  async findActivePublic(publicId: string): Promise<PublicVideoShareLink | null> {
    assertUuid(publicId);
    const result = await queryPostgres<{
      public_id: string; title: string; id: string; memory_id: string; artifact_key: string;
    }>(
      `SELECT s.public_id, s.title, j.id, j.memory_id, j.artifact_key
       FROM public.video_share_links s
       JOIN public.video_generation_jobs j ON j.id = s.video_job_id AND j.user_id = s.user_id AND j.memory_id = s.memory_id
       JOIN public.commerce_generation_reservations r ON r.id = j.reservation_id AND r.user_id = j.user_id
       JOIN public.commerce_credit_lots l ON l.id = r.credit_lot_id AND l.user_id = j.user_id
       WHERE s.public_id = $1::uuid AND s.revoked_at IS NULL
         AND j.status = 'succeeded' AND j.quality_status = 'approved'
         AND j.entitlement_settlement = 'committed' AND j.artifact_key IS NOT NULL
         AND r.purpose <> 'first_preview' AND l.save_allowed = TRUE
         AND NOT EXISTS (SELECT 1 FROM public.content_visibility_holds h WHERE h.status='hidden' AND (h.memory_id=s.memory_id OR h.video_job_id=j.id OR h.share_link_id=s.id))
         AND EXISTS (SELECT 1 FROM public.video_generation_quality_reviews q
           WHERE q.job_id = j.id AND q.reviewer_kind = 'manual' AND q.decision = 'approved')`,
      [publicId],
    );
    const row = result.rows[0];
    return row ? {
      publicId: row.public_id, title: row.title, jobId: row.id, memoryId: row.memory_id, artifactKey: row.artifact_key,
    } : null;
  }
}
