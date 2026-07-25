const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("013 adds one-time WeChat state and owner-bound hashed identities", () => {
  const migration = read("migrations/013_wechat_auth_identities.sql");
  const postflight = read("verification/013-wechat-auth-identities-postflight.sql");
  const runner = read("../scripts/postgresql/apply-migrations.sh");
  const repository = read("../src/server/auth/wechat/wechat-auth-repository.ts");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.auth_external_identities/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.auth_oauth_states/);
  assert.match(migration, /subject_hash CHARACTER\(64\) NOT NULL/);
  assert.doesNotMatch(migration, /\b(?:openid|unionid|access_token|refresh_token)\b/i);
  assert.match(migration, /REFERENCES public\.users\(id\) ON DELETE CASCADE/);
  assert.match(migration, /UNIQUE \(provider, subject_hash\)/);
  assert.match(migration, /UNIQUE \(provider, user_id\)/);
  assert.match(migration, /expires_at <= created_at \+ INTERVAL '10 minutes'/);
  assert.match(migration, /consumed_at IS NULL OR consumed_at >= created_at/);

  assert.match(postflight, /^BEGIN READ ONLY;/);
  assert.match(postflight, /identity ownership is invalid/);
  assert.match(postflight, /identity uniqueness is invalid/);
  assert.match(postflight, /state TTL is invalid/);
  assert.match(postflight, /COMMIT;\s*$/);
  assert.doesNotMatch(postflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);

  assert.ok(
    runner.indexOf("012_payment_refund_requests.sql")
      < runner.indexOf("013_wechat_auth_identities.sql"),
  );

  assert.doesNotMatch(repository, /input\.linkUserId|link_user_id,\s*expires_at/);
  assert.match(repository, /AND link_user_id IS NULL/);
  assert.match(repository, /const subjectHashes = \[[\s\S]+?\]\.sort\(\)/);
  assert.match(
    repository,
    /for \(const subjectHash of subjectHashes\)[\s\S]+?pg_advisory_xact_lock/,
  );
  assert.match(
    repository,
    /i\.subject_hash::text = ANY\(\$1::text\[\]\)/,
  );
  assert.match(repository, /if \(fallback\) return \{ status: "conflict" \}/);
});
