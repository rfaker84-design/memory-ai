#!/usr/bin/env bash
set -euo pipefail

project_root="${1:-/home/ubuntu/memory-ai}"
database="${MEMORYAI_PG_DATABASE:-memoryai}"

for migration in \
  "$project_root/database/migrations/001_memoryai_core.sql" \
  "$project_root/database/migrations/002_memoryai_indexes.sql" \
  "$project_root/database/migrations/003_memoryai_constraints.sql" \
  "$project_root/database/migrations/004_media_storage_foundation.sql" \
  "$project_root/database/migrations/005_memory_creation_idempotency.sql" \
  "$project_root/database/migrations/006_auth_verification_challenges.sql" \
  "$project_root/database/migrations/007_long_term_memories.sql" \
  "$project_root/database/migrations/008_memory_first_greetings.sql" \
  "$project_root/database/migrations/009_memory_chat_turn_idempotency.sql"
do
  test -f "$migration"
  sudo -n -u postgres psql -v ON_ERROR_STOP=1 --dbname="$database" --file="$migration" >/dev/null
done

sudo -n -u postgres psql -v ON_ERROR_STOP=1 --dbname="$database" >/dev/null <<'SQL'
GRANT USAGE ON SCHEMA public TO memoryai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO memoryai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO memoryai_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO memoryai_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO memoryai_app;
SQL

printf 'MIGRATIONS_APPLIED=pass\n'
