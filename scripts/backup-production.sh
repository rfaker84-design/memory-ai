#!/usr/bin/env bash
set -Eeuo pipefail

if (( $# != 0 )); then
  printf '%s\n' 'ERROR: backup-production.sh accepts no arguments; use the documented canonical backup entrypoint.' >&2
  exit 64
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
printf '%s\n' 'NOTICE: backup-production.sh is deprecated; delegating to the canonical PostgreSQL-to-COS backup entrypoint.' >&2
exec "$script_dir/backup/postgresql-to-cos.sh"
