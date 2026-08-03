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
  watermarkDownloadEnabled: false;
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
      public_id: string; title: string; video_job_id: string; memory_id: string; revoked_at: Date | null;
    }>(
      `WITH approved AS (
         SELECT j.id, j.memory_id, j.user_id
         FROM public.video_generation_jobs j
         JOIN public.users u ON u.id = j.user_id
         WHERE u.external_id = $1 AND j.memory_id = $2::uuid AND j.id = $3::uuid
           AND j.status = 'succeeded' AND j.quality_status = 'approved'
           AND j.entitlement_settlement = 'committed' AND j.artifact_key IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.video_generation_quality_reviews q
             WHERE q.job_id = j.id AND q.reviewer_kind = 'manual' AND q.decision = 'approved')
       )
       INSERT INTO public.video_share_links (user_id, memory_id, video_job_id, title)
       SELECT user_id, memory_id, id, $4 FROM approved
       ON CONFLICT (video_job_id) WHERE revoked_at IS NULL
       DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
       RETURNING public_id, title, video_job_id, memory_id, revoked_at`,
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
      watermarkDownloadEnabled: false,
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

  async findActivePublic(publicId: string): Promise<PublicVideoShareLink | null> {
    assertUuid(publicId);
    const result = await queryPostgres<{
      public_id: string; title: string; id: string; memory_id: string; artifact_key: string;
    }>(
      `SELECT s.public_id, s.title, j.id, j.memory_id, j.artifact_key
       FROM public.video_share_links s
       JOIN public.video_generation_jobs j ON j.id = s.video_job_id AND j.user_id = s.user_id AND j.memory_id = s.memory_id
       WHERE s.public_id = $1::uuid AND s.revoked_at IS NULL
         AND j.status = 'succeeded' AND j.quality_status = 'approved'
         AND j.entitlement_settlement = 'committed' AND j.artifact_key IS NOT NULL
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
