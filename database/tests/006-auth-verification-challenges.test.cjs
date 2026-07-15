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
      await assert.rejects(client.query(migration006), /unexpected definition|unexpected columns/i);
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
