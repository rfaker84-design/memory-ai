-- CANDIDATE ONLY: no automatic runner, Staging, or production approval.
-- Formal public sharing stores only an opaque link and approved-video reference;
-- it never stores a Provider URL, object key, or media body.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15min';
SET LOCAL search_path = pg_catalog, public;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.users') IS NULL
     OR pg_catalog.to_regclass('public.memories') IS NULL
     OR pg_catalog.to_regclass('public.video_generation_jobs') IS NULL THEN
    RAISE EXCEPTION '021 requires users, memories, and video_generation_jobs';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.video_share_links (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  user_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  video_job_id UUID NOT NULL,
  public_id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  title TEXT NOT NULL,
  watermark_download_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_video_share_links PRIMARY KEY (id),
  CONSTRAINT uq_video_share_links_public_id UNIQUE (public_id),
  CONSTRAINT fk_video_share_links_user FOREIGN KEY (user_id)
    REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_video_share_links_memory FOREIGN KEY (memory_id)
    REFERENCES public.memories(id) ON DELETE CASCADE,
  CONSTRAINT fk_video_share_links_video_job FOREIGN KEY (video_job_id)
    REFERENCES public.video_generation_jobs(id) ON DELETE CASCADE,
  CONSTRAINT ck_video_share_links_title CHECK (char_length(btrim(title)) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS ix_video_share_links_owner_memory
  ON public.video_share_links (user_id, memory_id, created_at DESC)
  WHERE revoked_at IS NULL;

-- A revoked link is retained as an audit record, but never prevents the owner
-- from creating one new active link for the same approved video.
CREATE UNIQUE INDEX IF NOT EXISTS ux_video_share_links_active_video_job
  ON public.video_share_links (video_job_id)
  WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS trg_video_share_links_updated_at ON public.video_share_links;
CREATE TRIGGER trg_video_share_links_updated_at
  BEFORE UPDATE ON public.video_share_links
  FOR EACH ROW EXECUTE FUNCTION public.memoryai_set_updated_at();

COMMIT;
