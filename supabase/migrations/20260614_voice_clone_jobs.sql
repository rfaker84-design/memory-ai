-- Voice clone and digital human job fields for MemoryAI.
-- Run this once in Supabase SQL Editor before enabling real workers.

alter table memories
add column if not exists voice_provider text,
add column if not exists voice_model_id text,
add column if not exists voice_model_url text,
add column if not exists voice_clone_error text,
add column if not exists avatar_error text;

alter table avatar_jobs
add column if not exists user_phone text,
add column if not exists progress integer default 0,
add column if not exists retry_count integer default 0,
add column if not exists provider_request jsonb,
add column if not exists updated_at timestamptz default now();

create index if not exists idx_avatar_jobs_memory_id_created_at
on avatar_jobs (memory_id, created_at desc);

create index if not exists idx_avatar_jobs_user_phone_created_at
on avatar_jobs (user_phone, created_at desc);

create index if not exists idx_avatar_jobs_status
on avatar_jobs (status);
