const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const migration001 = read("migrations/001_memoryai_core.sql");
const migration002 = read("migrations/002_memoryai_indexes.sql");
const migration003 = read("migrations/003_memoryai_constraints.sql");
const migration004 = read("migrations/004_media_storage_foundation.sql");
const migration005 = read("migrations/005_memory_creation_idempotency.sql");
const preflight = read("verification/sprint15-preflight.sql");
const postflight = read("verification/sprint15-postflight.sql");

test("migration hardening has transactional safety and bounded waits", () => {
  for (const [name, sql] of [["004", migration004], ["005", migration005]]) {
    assert.match(sql, /^BEGIN;/);
    assert.match(sql, /SET LOCAL lock_timeout = '2s';/);
    assert.match(sql, /SET LOCAL statement_timeout = '15min';/);
    assert.match(sql, /COMMIT;\s*$/);
    assert.doesNotMatch(sql, /CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i, `${name} must stay atomic`);
  }
});

test("004 limits normalization and validates data before indexes", () => {
  assert.match(migration004, /WHERE media_type IS DISTINCT FROM lower\(media_type\)/);
  assert.match(migration004, /WHERE sha256 IS NULL;/);
  assert.ok(migration004.indexOf("active_duplicates") < migration004.indexOf("CREATE UNIQUE INDEX ux_media_assets_active_hash"));
  assert.match(migration004, /NOT VALID;/);
  assert.match(migration004, /VALIDATE CONSTRAINT ck_media_assets_sha256_not_null_migration/);
  assert.match(migration004, /ALTER COLUMN sha256 SET NOT NULL/);
  assert.match(migration004, /unexpected owner or definition/g);
});

test("005 rejects source anomalies and only backfills missing targets", () => {
  assert.ok(migration005.indexOf("invalid_source_keys") < migration005.indexOf("UPDATE public.memories"));
  assert.match(migration005, /SET creation_idempotency_key = idempotency_key::text\s+WHERE creation_idempotency_key IS NULL;/);
  assert.match(migration005, /target_duplicates/);
  assert.match(migration005, /NOT VALID;/);
  assert.match(migration005, /ALTER COLUMN creation_idempotency_key SET NOT NULL/);
  assert.match(migration005, /unexpected owner or definition/g);
});

test("verification scripts cover required preflight and postflight evidence", () => {
  for (const token of [
    "estimated_live_rows", "estimated_dead_rows", "database_size", "tablespace_location",
    "pg_locks", "invalid_status", "invalid_type", "invalid_sha", "active_duplicates",
    "null_source_keys", "invalid_source_keys", "idempotency_duplicates", "pg_get_indexdef",
    "pg_get_constraintdef",
  ]) assert.ok(preflight.includes(token), `preflight missing ${token}`);

  for (const token of [
    "exact_row_count", "column_name", "indisvalid", "convalidated", "invalid_sha256",
    "active_duplicate_groups", "invalid_creation_keys", "creation_idempotency_duplicate_groups",
    "sprint15_schema_complete",
  ]) assert.ok(postflight.includes(token), `postflight missing ${token}`);
});

const testDatabaseUrl = process.env.MEMORYAI_TEST_DATABASE_URL;

function validateTestDatabaseUrl(value) {
  const url = new URL(value);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  assert.ok(localHosts.has(url.hostname), "integration tests refuse non-local PostgreSQL hosts");
  assert.match(url.pathname.slice(1), /test/i, "integration database name must contain 'test'");
}

async function withClient(callback) {
  const { Client } = require("pg");
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function resetBase(client) {
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.query(migration001);
  await client.query(migration002);
  await client.query(migration003);
}

async function seedUserAndMemory(client, key = "a".repeat(64)) {
  const user = await client.query(
    "INSERT INTO public.users (external_id) VALUES ($1) RETURNING id",
    [`test-${Math.random()}`],
  );
  const memory = await client.query(
    "INSERT INTO public.memories (user_id, name, idempotency_key) VALUES ($1, 'Test', $2) RETURNING id",
    [user.rows[0].id, key],
  );
  return { userId: user.rows[0].id, memoryId: memory.rows[0].id };
}

async function expectMigrationFailure(client, migration, pattern) {
  await assert.rejects(client.query(migration), pattern);
  await client.query("ROLLBACK");
}

test("isolated PostgreSQL migration matrix", { skip: !testDatabaseUrl, timeout: 120_000 }, async (t) => {
  validateTestDatabaseUrl(testDatabaseUrl);

  await withClient(async (client) => {
    await t.test("empty database and consecutive double execution", async () => {
      await resetBase(client);
      await client.query(migration004);
      await client.query(migration005);
      await client.query(migration004);
      await client.query(migration005);
    });

    await t.test("legal history and mixed-case normalization without repeat updates", async () => {
      await resetBase(client);
      const seeded = await seedUserAndMemory(client);
      const media = await client.query(
        "INSERT INTO public.media_assets (user_id, memory_id, media_type, status) VALUES ($1, $2, 'IMAGE', 'UPLOADED') RETURNING id",
        [seeded.userId, seeded.memoryId],
      );
      await client.query(migration004);
      await client.query(migration005);
      const first = await client.query(
        "SELECT xmin::text, media_type, status FROM public.media_assets WHERE id = $1",
        [media.rows[0].id],
      );
      await client.query(migration004);
      await client.query(migration005);
      const second = await client.query(
        "SELECT xmin::text, media_type, status FROM public.media_assets WHERE id = $1",
        [media.rows[0].id],
      );
      assert.equal(first.rows[0].media_type, "image");
      assert.equal(first.rows[0].status, "uploaded");
      assert.equal(second.rows[0].xmin, first.rows[0].xmin);
    });

    await t.test("invalid enum aborts the complete 004 transaction", async () => {
      await resetBase(client);
      const seeded = await seedUserAndMemory(client);
      await client.query(
        "INSERT INTO public.media_assets (user_id, memory_id, media_type, status) VALUES ($1, $2, 'image', 'mystery')",
        [seeded.userId, seeded.memoryId],
      );
      await expectMigrationFailure(client, migration004, /unsupported status/i);
      const column = await client.query(
        "SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.media_assets'::regclass AND attname = 'sha256' AND NOT attisdropped",
      );
      assert.equal(column.rowCount, 0);
    });

    await t.test("invalid SHA aborts 004", async () => {
      await resetBase(client);
      await client.query("ALTER TABLE public.media_assets ADD COLUMN sha256 CHARACTER(64)");
      const seeded = await seedUserAndMemory(client);
      await client.query(
        "INSERT INTO public.media_assets (user_id, memory_id, media_type, status, sha256) VALUES ($1, $2, 'image', 'uploaded', $3)",
        [seeded.userId, seeded.memoryId, "z".repeat(64)],
      );
      await expectMigrationFailure(client, migration004, /invalid sha256/i);
    });

    await t.test("active duplicate hash aborts 004", async () => {
      await resetBase(client);
      await client.query("ALTER TABLE public.media_assets ADD COLUMN sha256 CHARACTER(64)");
      const seeded = await seedUserAndMemory(client);
      for (let index = 0; index < 2; index += 1) {
        await client.query(
          "INSERT INTO public.media_assets (user_id, memory_id, media_type, status, sha256) VALUES ($1, $2, 'image', 'uploaded', $3)",
          [seeded.userId, seeded.memoryId, "b".repeat(64)],
        );
      }
      await expectMigrationFailure(client, migration004, /target uniqueness/i);
    });

    await t.test("invalid and duplicate idempotency keys abort 005", async () => {
      await resetBase(client);
      await seedUserAndMemory(client, "!".repeat(64));
      await expectMigrationFailure(client, migration005, /source idempotency keys have invalid format/i);

      await resetBase(client);
      const first = await seedUserAndMemory(client, "c".repeat(64));
      await client.query(
        "INSERT INTO public.memories (user_id, name, idempotency_key) VALUES ($1, 'Second', $2)",
        [first.userId, "d".repeat(64)],
      );
      await client.query("ALTER TABLE public.memories ADD COLUMN creation_idempotency_key TEXT");
      await client.query("UPDATE public.memories SET creation_idempotency_key = $1", ["same-key-1234567890"]);
      await expectMigrationFailure(client, migration005, /target uniqueness/i);
    });

    await t.test("same-name wrong index and constraint definitions abort", async () => {
      await resetBase(client);
      await client.query("CREATE INDEX ux_media_assets_active_hash ON public.media_assets (status)");
      await expectMigrationFailure(client, migration004, /index public.*unexpected owner or definition/i);

      await resetBase(client);
      await client.query("ALTER TABLE public.media_assets ADD COLUMN sha256 CHARACTER(64)");
      await client.query(
        "ALTER TABLE public.media_assets ADD CONSTRAINT ck_media_assets_sha256 CHECK (sha256 IS NULL OR sha256 IS NOT NULL)",
      );
      await expectMigrationFailure(client, migration004, /constraint public.*unexpected owner or definition/i);
    });
  });

  await t.test("lock timeout leaves 004 unapplied", async () => {
    const { Client } = require("pg");
    const blocker = new Client({ connectionString: testDatabaseUrl });
    const runner = new Client({ connectionString: testDatabaseUrl });
    await blocker.connect();
    await runner.connect();
    try {
      await resetBase(blocker);
      await blocker.query("BEGIN; SELECT count(*) FROM public.media_assets;");
      await expectMigrationFailure(runner, migration004, /lock timeout|canceling statement due to lock timeout/i);
      await blocker.query("ROLLBACK");
      const column = await runner.query(
        "SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.media_assets'::regclass AND attname = 'sha256' AND NOT attisdropped",
      );
      assert.equal(column.rowCount, 0);
    } finally {
      await blocker.query("ROLLBACK").catch(() => {});
      await blocker.end();
      await runner.end();
    }
  });
});
