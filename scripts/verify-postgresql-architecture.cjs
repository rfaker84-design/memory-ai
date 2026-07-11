const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const route = read("app/api/memories/route.ts");
const health = read("app/api/health/database/route.ts");
const dataSource = read("features/memory/memory-postgres-datasource.ts");
const chatRoute = read("app/api/memory-chat/route.ts");
const contextBuilder = read("features/memory-engine/context-builder.ts");
const migrationRunner = read("scripts/postgresql/apply-migrations.sh");
const idempotencyMigration = read("database/migrations/005_memory_creation_idempotency.sql");

assert(route.includes("MemoryPostgresDataSource"), "Memory API is not wired to PostgreSQL");
assert(route.includes("idempotency-key"), "Memory API does not read Idempotency-Key");
assert(!route.includes("MemorySupabaseDataSource"), "Memory API still references Supabase");
assert(health.includes("SELECT 1"), "Database health route does not issue SELECT 1");
assert(!health.toLowerCase().includes("supabase"), "Database health still references Supabase");
assert(dataSource.includes("withPostgresTransaction"), "Memory writes do not use transactions");
assert(dataSource.includes("creation_idempotency_key"), "Memory datasource does not persist request idempotency keys");
assert(dataSource.includes("$1"), "Memory datasource lacks parameterized SQL markers");
assert(chatRoute.includes("ChatPostgresDataSource"), "Memory chat is not wired to PostgreSQL");
assert(!chatRoute.includes("ChatSupabaseDataSource"), "Memory chat still selects Supabase");
assert(contextBuilder.includes("MemoryPostgresDataSource"), "Memory engine context still selects Supabase memory data");
assert(contextBuilder.includes("ChatPostgresDataSource"), "Memory engine context still selects Supabase chat data");
assert(migrationRunner.includes("004_media_storage_foundation.sql"), "Migration runner omits media storage migration");
assert(migrationRunner.includes("005_memory_creation_idempotency.sql"), "Migration runner omits memory idempotency migration");
assert(idempotencyMigration.includes("BEGIN;") && idempotencyMigration.includes("COMMIT;"), "Idempotency migration is not transactional");
assert(idempotencyMigration.includes("CREATE UNIQUE INDEX IF NOT EXISTS"), "Idempotency migration is not repeatable");

for (const clientFile of ["app/page.tsx", "app/create-memory/page.tsx"]) {
  const source = read(clientFile);
  assert(!source.includes("MemoryPostgresDataSource"), `${clientFile} imports the server datasource`);
  assert(!source.includes("DATABASE_URL"), `${clientFile} references database credentials`);
}

if (failures.length) {
  console.error("PostgreSQL architecture verification failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("PostgreSQL architecture verification passed.");
