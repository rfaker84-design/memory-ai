#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
reapply="$root/scripts/postgresql/reapply-account-deletion-tombstones.sh"
restore="$root/scripts/postgresql/restore-drill.sh"

bash -n "$reapply"
bash -n "$restore"
grep -F 'memoryai_restore_' "$reapply" >/dev/null
grep -F 'ACCOUNT_DELETION_TOMBSTONE_TARGET_REJECTED' "$reapply" >/dev/null
grep -F 'DELETE FROM public.memory_fragments' "$reapply" >/dev/null
grep -F 'DELETE FROM public.video_generation_jobs' "$reapply" >/dev/null
grep -F 'DELETE FROM public.auth_external_identities' "$reapply" >/dev/null
grep -F "account_deletion_tombstone" "$reapply" >/dev/null
grep -F 'MEMORYAI_DELETION_TOMBSTONE_SOURCE_DATABASE' "$restore" >/dev/null
grep -F 'reapply-account-deletion-tombstones.sh' "$restore" >/dev/null
printf '%s\n' 'PASS account-deletion tombstone restore contracts'
