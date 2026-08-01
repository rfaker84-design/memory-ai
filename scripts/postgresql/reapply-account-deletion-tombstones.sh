#!/usr/bin/env bash
set -euo pipefail

# Reapply current deletion tombstones to an old backup restored into an
# isolated drill database.  This is deliberately not a production data-change
# tool: it only accepts a memoryai_restore_* target and reads the source list
# through the local postgres role.

source_database="${1:?source database is required}"
target_database="${2:?target database is required}"

if [[ "$source_database" == "$target_database" || ! "$target_database" =~ ^memoryai_restore_[a-z0-9_]+$ ]]; then
  printf '%s\n' 'ACCOUNT_DELETION_TOMBSTONE_TARGET_REJECTED' >&2
  exit 64
fi

for name in "$source_database" "$target_database"; do
  [[ "$name" =~ ^[a-z][a-z0-9_]{2,62}$ ]] || { printf '%s\n' 'ACCOUNT_DELETION_TOMBSTONE_DATABASE_NAME_INVALID' >&2; exit 64; }
done

required_relations="account_deletion_requests users memories memory_fragments long_term_memories memory_chat_turns memory_first_greetings messages conversations business_funnel_events commerce_photo_remedies media_assets provider_jobs video_generation_jobs auth_external_identities auth_oauth_states consent_records audit_logs"
for database in "$source_database" "$target_database"; do
  missing="$(sudo -n -u postgres psql -d "$database" -Atq -v ON_ERROR_STOP=1 -c "SELECT string_agg(name, ',') FROM unnest(string_to_array('$required_relations', ' ')) AS name WHERE to_regclass('public.' || name) IS NULL")"
  [[ -z "$missing" ]] || { printf 'ACCOUNT_DELETION_TOMBSTONE_SCHEMA_MISSING database=%s\n' "$database" >&2; exit 65; }
done

apply_tombstone() {
  local user_id="$1"
  sudo -n -u postgres psql -d "$target_database" -q -v ON_ERROR_STOP=1 -v user_id="$user_id" <<'SQL'
BEGIN;
DELETE FROM public.long_term_memories WHERE memory_id IN (SELECT id FROM public.memories WHERE user_id=:'user_id'::uuid);
DELETE FROM public.memory_fragments WHERE memory_id IN (SELECT id FROM public.memories WHERE user_id=:'user_id'::uuid);
DELETE FROM public.memory_chat_turns WHERE user_id=:'user_id'::uuid;
DELETE FROM public.memory_first_greetings WHERE user_id=:'user_id'::uuid;
DELETE FROM public.messages WHERE user_id=:'user_id'::uuid;
DELETE FROM public.conversations WHERE user_id=:'user_id'::uuid;
DELETE FROM public.business_funnel_events WHERE user_id=:'user_id'::uuid;
DELETE FROM public.commerce_photo_remedies WHERE user_id=:'user_id'::uuid;
DELETE FROM public.video_generation_jobs WHERE user_id=:'user_id'::uuid;
DELETE FROM public.provider_jobs WHERE user_id=:'user_id'::uuid;
DELETE FROM public.media_assets WHERE user_id=:'user_id'::uuid;
DELETE FROM public.auth_external_identities WHERE user_id=:'user_id'::uuid;
DELETE FROM public.auth_oauth_states WHERE link_user_id=:'user_id'::uuid;
UPDATE public.consent_records
SET memory_id=NULL, owner_name=NULL, relationship_to_owner=NULL, proof_key=NULL, notes=NULL,
    metadata=jsonb_build_object('account_deletion_tombstone', true), updated_at=NOW()
WHERE user_id=:'user_id'::uuid;
UPDATE public.audit_logs
SET memory_id=NULL, message='account deletion audit retained', metadata=jsonb_build_object('account_deletion_tombstone', true)
WHERE user_id=:'user_id'::uuid;
UPDATE public.memories
SET name='deleted', relationship='', life_story=NULL, personality_profile=NULL,
    speech_style=NULL, catch_phrases=NULL, photo_url=NULL, personality_tags=NULL,
    birth_year=NULL, death_year=NULL, values_belief=NULL, personality_type=NULL,
    voice_sample_url=NULL, voice_provider=NULL, voice_model_id=NULL, voice_model_url=NULL,
    voice_clone_status=NULL, voice_training_status=NULL, voice_clone_error=NULL,
    avatar_video_url=NULL, avatar_status=NULL, avatar_job_id=NULL, avatar_provider=NULL,
    avatar_error=NULL, metadata=jsonb_build_object('account_deletion_tombstone', true),
    deleted_at=NOW(), updated_at=NOW()
WHERE user_id=:'user_id'::uuid;
UPDATE public.users SET profile='{}'::jsonb, updated_at=NOW() WHERE id=:'user_id'::uuid;
COMMIT;
SQL
}

count=0
while IFS= read -r user_id; do
  [[ "$user_id" =~ ^[0-9a-fA-F-]{36}$ ]] || { printf '%s\n' 'ACCOUNT_DELETION_TOMBSTONE_SOURCE_ROW_INVALID' >&2; exit 66; }
  apply_tombstone "$user_id"
  count=$((count + 1))
done < <(sudo -n -u postgres psql -d "$source_database" -Atq -v ON_ERROR_STOP=1 -c "SELECT user_id::text FROM public.account_deletion_requests")

printf 'ACCOUNT_DELETION_TOMBSTONES_REAPPLIED count=%s target=%s\n' "$count" "$target_database"
