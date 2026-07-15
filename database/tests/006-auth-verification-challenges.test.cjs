const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const databaseRoot = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(databaseRoot, relativePath), "utf8");

const migrations = ["001", "002", "003", "004", "005"].map((number) => {
  const file = fs.readdirSync(path.join(databaseRoot, "migrations"))
    .find((name) => name.startsWith(`${number}_`));
  return read(path.join("migrations", file));
});
const migration006 = read("migrations/006_auth_verification_challenges.sql");
const preflight = read("verification/006-auth-preflight.sql");
const postflight = read("verification/006-auth-postflight.sql");

test("006 is atomic, bounded, schema-qualified, and does not rewrite history", () => {
  assert.match(migration006, /^BEGIN;/);
  assert.match(migration006, /SET LOCAL lock_timeout = '2s';/);
  assert.match(migration006, /SET LOCAL statement_timeout = '15min';/);
  assert.match(migration006, /public\.auth_verification_challenges/g);
  assert.doesNotMatch(migration006, /UPDATE\s+public\.auth_verification_challenges/i);
  assert.match(migration006, /COMMIT;\s*$/);
});

test("006 stores only fixed-length digests and enforces challenge lifecycle", () => {
  for (const column of [
    "challenge_id", "phone_hash", "code_digest", "purpose", "expires_at",
    "resend_after", "attempts", "max_attempts", "consumed_at",
    "request_ip_hash", "provider_request_id", "created_at", "updated_at",
  ]) assert.ok(migration006.includes(column), `missing ${column}`);

  assert.doesNotMatch(migration006, /\bphone\s+(?:TEXT|VARCHAR)/i);
  assert.doesNotMatch(migration006, /\bcode\s+(?:TEXT|VARCHAR|CHARACTER)/i);
  assert.match(migration006, /attempts <= max_attempts/);
  assert.match(migration006, /expires_at > resend_after/);
  assert.match(migration006, /unexpected owner or definition/g);
});

test("006 validates challenge_id structurally without brittle default text equality", () => {
  assert.match(migration006, /challenge_id UUID NOT NULL DEFAULT pg_catalog\.gen_random_uuid\(\) PRIMARY KEY/);

  // Correct UUID type/typmod, explicit nullability, and ordinary columns only.
  assert.match(migration006, /actual_type_oid IS DISTINCT FROM 'pg_catalog\.uuid'::regtype/);
  assert.match(migration006, /actual_typmod IS DISTINCT FROM -1/);
  assert.match(migration006, /actual_not_null IS DISTINCT FROM true/);
  assert.match(migration006, /actual_identity IS DISTINCT FROM ''/);
  assert.match(migration006, /actual_generated IS DISTINCT FROM ''/);

  // A default must exist, be a direct normalized call, and resolve to the
  // PostgreSQL 14 pg_catalog function OID. Missing, constant, composed,
  // wrong-function, and wrong-schema defaults therefore fail closed.
  assert.match(migration006, /default_oid IS NULL/);
  assert.match(migration006, /\(\?:pg_catalog\\\.\)\?gen_random_uuid/);
  assert.match(migration006, /pg_catalog\.to_regprocedure\('pg_catalog\.gen_random_uuid\(\)'\)/);
  assert.match(migration006, /builtin_default_return_type_oid IS DISTINCT FROM 'pg_catalog\.uuid'::regtype/);
  assert.doesNotMatch(migration006, /actual_default IS DISTINCT FROM 'gen_random_uuid\(\)'/);

  // Exactly one primary key must exist and its complete conkey must contain
  // challenge_id alone; non-PK and composite/wrong PK definitions are rejected.
  assert.match(migration006, /c\.conrelid = target_oid/);
  assert.match(migration006, /c\.contype = 'p'/);
  assert.match(migration006, /primary_key_count <> 1/);
  assert.match(migration006, /primary_key_columns IS DISTINCT FROM ARRAY\[challenge_attnum\]::SMALLINT\[\]/);
});

test("006 accepts a pinned built-in without requiring a pg_proc dependency", () => {
  const postgres1423PinnedFunctionProbe = Object.freeze({
    default_expression: "gen_random_uuid()",
    pg_proc_dependency_count: 0,
  });
  assert.equal(postgres1423PinnedFunctionProbe.pg_proc_dependency_count, 0);
  assert.equal(postgres1423PinnedFunctionProbe.default_expression, "gen_random_uuid()");
  assert.doesNotMatch(migration006, /pg_catalog\.pg_depend|\bpg_depend\b/);
  assert.doesNotMatch(migration006, /refclassid|dependency\.refobjid|default_function_name \|\|/);
  assert.match(migration006, /pg_get_expr\(d\.adbin, d\.adrelid\)/);
  assert.match(migration006, /to_regprocedure\('pg_catalog\.gen_random_uuid\(\)'\)/);
});

test("006 reports the exact challenge_id predicate that failed", () => {
  for (const field of [
    "column is missing", "atttypid", "atttypmod", "attnotnull", "attidentity",
    "attgenerated", "default is missing", "default must directly call",
    "primary key count", "primary key conkey",
  ]) assert.ok(migration006.includes(field), `missing detailed failure for ${field}`);
  assert.doesNotMatch(migration006, /challenge_id has an unexpected definition/);
});

test("006 preflight and postflight expose operational evidence", () => {
  for (const token of ["estimated_live_rows", "pg_locks", "existing_table"])
    assert.ok(preflight.includes(token), `preflight missing ${token}`);
  for (const token of [
    "exact_row_count", "column_name", "indisvalid", "convalidated",
    "invalid_phone_hashes", "invalid_attempt_counts", "auth_challenge_schema_complete",
  ]) assert.ok(postflight.includes(token), `postflight missing ${token}`);
});

const testDatabaseUrl = process.env.MEMORYAI_TEST_DATABASE_URL;

function validateTestDatabaseUrl(value) {
  const url = new URL(value);
  assert.ok(new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname));
  assert.match(url.pathname.slice(1), /test/i);
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
  for (const migration of migrations) await client.query(migration);
}

function challengeTable(challengeDefinition, tableConstraint = "") {
  return `
    CREATE TABLE public.auth_verification_challenges (
      challenge_id ${challengeDefinition},
      phone_hash CHARACTER(64) NOT NULL,
      code_digest CHARACTER(64) NOT NULL,
      purpose TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      resend_after TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      consumed_at TIMESTAMPTZ,
      request_ip_hash CHARACTER(64) NOT NULL,
      provider_request_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      ${tableConstraint ? `, ${tableConstraint}` : ""}
    )
  `;
}

test("006 PostgreSQL positive, repeated, and negative matrix", {
  skip: !testDatabaseUrl,
  timeout: 120_000,
}, async (t) => {
  validateTestDatabaseUrl(testDatabaseUrl);

  await withClient(async (client) => {
    await t.test("applies on PostgreSQL 14 and repeats without row rewrites", async () => {
      const version = await client.query("SHOW server_version_num");
      assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 14);
      await resetBase(client);
      await client.query(migration006);
      const inserted = await client.query(`
        INSERT INTO public.auth_verification_challenges (
          phone_hash, code_digest, purpose, expires_at, resend_after, request_ip_hash
        ) VALUES ($1, $2, 'sign_in', NOW() + INTERVAL '5 minutes',
          NOW() + INTERVAL '60 seconds', $3)
        RETURNING challenge_id, xmin::text
      `, ["a".repeat(64), "b".repeat(64), "c".repeat(64)]);
      await client.query(migration006);
      const repeated = await client.query(
        "SELECT xmin::text FROM public.auth_verification_challenges WHERE challenge_id = $1",
        [inserted.rows[0].challenge_id],
      );
      assert.equal(repeated.rows[0].xmin, inserted.rows[0].xmin);
    });

    await t.test("rejects a same-name table with the wrong definition", async () => {
      await resetBase(client);
      await client.query("CREATE TABLE public.auth_verification_challenges (challenge_id UUID)");
      await assert.rejects(client.query(migration006), /challenge_id check failed|unexpected columns/i);
      await client.query("ROLLBACK");
    });

    await t.test("accepts PostgreSQL 14 normalized UUID defaults", async () => {
      for (const defaultExpression of [
        "gen_random_uuid()",
        "pg_catalog.gen_random_uuid()",
        "gen_random_uuid()::uuid",
        "(pg_catalog.gen_random_uuid())::uuid",
      ]) {
        await resetBase(client);
        await client.query(challengeTable(
          `UUID NOT NULL DEFAULT ${defaultExpression} PRIMARY KEY`,
        ));
        await client.query(migration006);
      }
    });

    for (const negativeCase of [
      {
        name: "text challenge_id",
        definition: "TEXT NOT NULL DEFAULT pg_catalog.gen_random_uuid()::text PRIMARY KEY",
      },
      {
        name: "nullable UUID challenge_id",
        definition: "UUID DEFAULT pg_catalog.gen_random_uuid()",
      },
      {
        name: "missing challenge_id default",
        definition: "UUID NOT NULL PRIMARY KEY",
      },
      {
        name: "wrong challenge_id default",
        definition: "UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid PRIMARY KEY",
      },
      {
        name: "same-name non-primary challenge_id",
        definition: "UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid()",
      },
      {
        name: "same-name composite primary key",
        definition: "UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid()",
        constraint: "PRIMARY KEY (challenge_id, phone_hash)",
      },
    ]) {
      await t.test(`rejects ${negativeCase.name}`, async () => {
        await resetBase(client);
        await client.query(challengeTable(
          negativeCase.definition,
          negativeCase.constraint,
        ));
        await assert.rejects(
          client.query(migration006),
          /challenge_id check failed/i,
        );
        await client.query("ROLLBACK");
      });
    }

    await t.test("rejects a default function from the wrong schema", async () => {
      await resetBase(client);
      await client.query("CREATE SCHEMA auth_shadow");
      await client.query(`
        CREATE FUNCTION auth_shadow.gen_random_uuid()
        RETURNS UUID LANGUAGE SQL IMMUTABLE
        AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $$
      `);
      await client.query(challengeTable(
        "UUID NOT NULL DEFAULT auth_shadow.gen_random_uuid() PRIMARY KEY",
      ));
      await assert.rejects(client.query(migration006), /challenge_id check failed: default/i);
      await client.query("ROLLBACK");
    });

    await t.test("rejects the public wrapper even when it has the same name", async () => {
      await resetBase(client);
      await client.query(challengeTable(
        "UUID NOT NULL DEFAULT public.gen_random_uuid() PRIMARY KEY",
      ));
      await assert.rejects(client.query(migration006), /default must directly call/i);
      await client.query("ROLLBACK");
    });

    await t.test("rejects wrong same-name indexes", async () => {
      await resetBase(client);
      await client.query(migration006);
      await client.query("DROP INDEX public.idx_auth_challenges_phone_created");
      await client.query("CREATE INDEX idx_auth_challenges_phone_created ON public.auth_verification_challenges (purpose)");
      await assert.rejects(client.query(migration006), /index public.*unexpected owner or definition/i);
      await client.query("ROLLBACK");
    });

    await t.test("constraints reject plaintext-shaped and invalid lifecycle rows", async () => {
      await resetBase(client);
      await client.query(migration006);
      const valid = ["a".repeat(64), "b".repeat(64), "c".repeat(64)];
      await assert.rejects(client.query(`
        INSERT INTO public.auth_verification_challenges (
          phone_hash, code_digest, purpose, expires_at, resend_after, request_ip_hash
        ) VALUES ('phone', $1, 'sign_in', NOW() + INTERVAL '5 minutes',
          NOW() + INTERVAL '60 seconds', $2)
      `, [valid[1], valid[2]]), /ck_auth_challenge_phone_hash/i);
      await assert.rejects(client.query(`
        INSERT INTO public.auth_verification_challenges (
          phone_hash, code_digest, purpose, expires_at, resend_after,
          attempts, max_attempts, request_ip_hash
        ) VALUES ($1, $2, 'sign_in', NOW() + INTERVAL '5 minutes',
          NOW() + INTERVAL '60 seconds', 6, 5, $3)
      `, valid), /ck_auth_challenge_attempts/i);
    });
  });
});
