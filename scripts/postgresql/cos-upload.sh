#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' 'NOTICE: cos-upload.sh is deprecated; delegating to the canonical PostgreSQL COS backup entrypoint.' >&2
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")/../backup" && pwd)/postgresql-to-cos.sh"
