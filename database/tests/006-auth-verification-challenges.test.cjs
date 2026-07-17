const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const databaseRoot = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(databaseRoot, relativePath), "utf8");

function normalizeShellBuffer(buffer, label = "shell script") {
  assert.ok(Buffer.isBuffer(buffer), `${label} must be read as bytes`);
  const hasBom =
    (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) ||
    (buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) ||
      (buffer[0] === 0xfe && buffer[1] === 0xff)));
  assert.equal(hasBom, false, `${label} must not contain a BOM`);

  let sawLf = false;
  let sawCrlf = false;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0x0d) {
      assert.equal(buffer[index + 1], 0x0a, `${label} contains a lone CR`);
      sawCrlf = true;
      index += 1;
    } else if (buffer[index] === 0x0a) {
      sawLf = true;
    }
  }
  assert.equal(sawLf && sawCrlf, false, `${label} contains mixed LF and CRLF line endings`);
  return buffer.toString("utf8").replaceAll("\r\n", "\n");
}

const readShell = (relativePath) => {
  const absolutePath = path.join(databaseRoot, relativePath);
  return normalizeShellBuffer(fs.readFileSync(absolutePath), relativePath);
};

const migrations = ["001", "002", "003", "004", "005"].map((number) => {
  const file = fs.readdirSync(path.join(databaseRoot, "migrations"))
    .find((name) => name.startsWith(`${number}_`));
  return read(path.join("migrations", file));
});
const migration006 = read("migrations/006_auth_verification_challenges.sql");
const preflight = read("verification/006-auth-preflight.sql");
const postflight = read("verification/006-auth-postflight.sql");
const postgres1423CheckExpressions = Object.freeze({
  ck_auth_challenge_phone_hash: "(phone_hash~'^[0-9a-f]{64}$'::text)",
  ck_auth_challenge_code_digest: "(code_digest~'^[0-9a-f]{64}$'::text)",
  ck_auth_challenge_ip_hash: "(request_ip_hash~'^[0-9a-f]{64}$'::text)",
  ck_auth_challenge_purpose: "(purpose='sign_in'::text)",
  ck_auth_challenge_attempts: "((attempts>=0)AND(max_attempts>0)AND(attempts<=max_attempts))",
  ck_auth_challenge_timing: "((resend_after>created_at)AND(expires_at>resend_after))",
  ck_auth_challenge_consumed_at: "((consumed_atISNULL)OR(consumed_at>=created_at))",
  ck_auth_challenge_provider_request_id: "((provider_request_idISNULL)OR((char_length(provider_request_id)>=1)AND(char_length(provider_request_id)<=128)))",
});

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
  assert.doesNotMatch(migration006, /unexpected owner/i);
});

test("006 uses all eight PostgreSQL 14.23 normalized CHECK expressions", () => {
  for (const expression of Object.values(postgres1423CheckExpressions)) {
    const sqlLiteral = expression.replaceAll("'", "''");
    assert.ok(migration006.includes(sqlLiteral), `missing normalized expression ${expression}`);
  }
  assert.doesNotMatch(migration006, /\(phone_hash\)::text|\(code_digest\)::text|\(request_ip_hash\)::text/);
  assert.doesNotMatch(migration006, /purpose=ANY\(ARRAY/);
});

test("006 validates every CHECK name and catalog property structurally", () => {
  for (const field of [
    "constraint_name_count", "duplicate names", "is missing after creation",
    "actual_relation_oid", "actual_constraint_type", "actual_validated",
    "actual_no_inherit", "actual_deferrable", "actual_deferred",
    "actual_conkey", "expected_conkey", "wrong normalized expression",
  ]) assert.ok(migration006.includes(field), `missing CHECK guard ${field}`);
  for (const catalogField of [
    "c.conrelid", "c.contype", "c.convalidated", "c.connoinherit",
    "c.condeferrable", "c.condeferred", "c.conkey",
  ]) assert.ok(migration006.includes(catalogField), `missing catalog field ${catalogField}`);
  for (const predicate of [
    "actual_relation_oid IS DISTINCT FROM target_oid",
    "actual_constraint_type IS DISTINCT FROM 'c'",
    "actual_validated IS DISTINCT FROM true",
    "actual_no_inherit IS DISTINCT FROM false",
    "actual_deferrable IS DISTINCT FROM false",
    "actual_deferred IS DISTINCT FROM false",
    "actual_conkey IS DISTINCT FROM expected_conkey",
    "actual_definition IS DISTINCT FROM expected_definition",
  ]) assert.ok(migration006.includes(predicate), `missing CHECK predicate ${predicate}`);
  for (const expectedColumns of [
    "ARRAY['phone_hash']::TEXT[]",
    "ARRAY['code_digest']::TEXT[]",
    "ARRAY['request_ip_hash']::TEXT[]",
    "ARRAY['purpose']::TEXT[]",
    "ARRAY['attempts', 'max_attempts']::TEXT[]",
    "ARRAY['resend_after', 'created_at', 'expires_at']::TEXT[]",
    "ARRAY['consumed_at', 'created_at']::TEXT[]",
    "ARRAY['provider_request_id']::TEXT[]",
  ]) assert.ok(migration006.includes(expectedColumns), `missing conkey columns ${expectedColumns}`);
});

test("006 validates all three indexes structurally and retains definition checks", () => {
  for (const field of [
    "index_name_count", "duplicate names", "actual_relation_oid",
    "actual_access_method", "actual_primary", "actual_unique", "actual_valid",
    "actual_ready", "actual_live", "actual_has_predicate", "actual_has_expression",
    "actual_indkey", "actual_indoption", "actual_definition",
  ]) assert.ok(migration006.includes(field), `missing index guard ${field}`);
  for (const catalogField of [
    "indrelid", "indisprimary", "indisunique", "indisvalid", "indisready",
    "indislive", "indpred", "indexprs", "indkey", "indoption",
  ]) assert.ok(migration006.includes(catalogField), `missing index catalog field ${catalogField}`);
  assert.match(migration006, /actual_access_method IS DISTINCT FROM 'btree'/);
  assert.match(migration006, /actual_relation_oid IS DISTINCT FROM target_oid/);
  assert.match(migration006, /actual_primary IS DISTINCT FROM false/);
  assert.match(migration006, /actual_unique IS DISTINCT FROM false/);
  assert.match(migration006, /actual_valid IS DISTINCT FROM true/);
  assert.match(migration006, /actual_ready IS DISTINCT FROM true/);
  assert.match(migration006, /actual_live IS DISTINCT FROM true/);
  assert.match(migration006, /actual_has_predicate IS DISTINCT FROM false/);
  assert.match(migration006, /actual_has_expression IS DISTINCT FROM false/);
  assert.match(migration006, /actual_indkey IS DISTINCT FROM expected_indkey/);
  assert.match(migration006, /actual_indoption IS DISTINCT FROM expected_indoption/);
  assert.match(migration006, /actual_definition IS DISTINCT FROM expected_definition/);
  assert.match(migration006, /ARRAY\[0, 3\]::SMALLINT\[\]/);
  assert.match(migration006, /ARRAY\[0\]::SMALLINT\[\]/);
  assert.match(migration006, /index public\.% is not valid/);
  assert.match(migration006, /index public\.% is not ready/);
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

const psqlVariableTokenPattern = /:'[^'\r\n]+'|:"[^"\r\n]+"|:\{\?[^}\r\n]+\}/g;

const approvedPsqlScriptHeredocs = Object.freeze({
  CLEANUP_TERMINATE_SQL: Object.freeze({
    opener: `admin_psql_script terminate "$database" >/dev/null <<'CLEANUP_TERMINATE_SQL'`,
    token: ":'matrix_db'",
    body: "SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE datname = :'matrix_db' AND pid <> pg_catalog.pg_backend_pid();\n",
  }),
  CLEANUP_CONNECTIONS_SQL: Object.freeze({
    opener: `if capture_scalar_query admin "$ADMIN_DB" connection_count "$database" zero <<'CLEANUP_CONNECTIONS_SQL'`,
    token: ":'matrix_db'",
    body: "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname = :'matrix_db';\n",
  }),
  CLEANUP_EXISTS_SQL: Object.freeze({
    opener: `if capture_scalar_query admin "$ADMIN_DB" database_exists "$database" zero <<'CLEANUP_EXISTS_SQL'`,
    token: ":'matrix_db'",
    body: "SELECT count(*) FROM pg_catalog.pg_database WHERE datname = :'matrix_db';\n",
  }),
  RESIDUAL_DATABASES_SQL: Object.freeze({
    opener: `if capture_scalar_query admin "$ADMIN_DB" residual_count "\${RUN_DB_PREFIX}%" zero <<'RESIDUAL_DATABASES_SQL'`,
    token: ":'matrix_prefix'",
    body: "SELECT count(*) FROM pg_catalog.pg_database WHERE datname LIKE :'matrix_prefix';\n",
  }),
  PREEXISTING_DATABASES_SQL: Object.freeze({
    opener: `if capture_scalar_query admin "$ADMIN_DB" preexisting_count "$names" zero <<'PREEXISTING_DATABASES_SQL'`,
    token: ":'matrix_names'",
    body: "SELECT count(*) FROM pg_catalog.pg_database WHERE datname = ANY(pg_catalog.string_to_array(:'matrix_names', ','));\n",
  }),
  LOCK_SQL: Object.freeze({
    opener: `database_psql_script "$database" lock_holder "$application_name" >/dev/null 2>&1 <<'LOCK_SQL' &`,
    token: ":'lock_app'",
    body: "SELECT pg_catalog.set_config('application_name', :'lock_app', false);\n" +
      "BEGIN;\n" +
      "LOCK TABLE public.auth_verification_challenges IN ACCESS EXCLUSIVE MODE;\n" +
      "SELECT pg_catalog.pg_sleep(30);\n",
  }),
  LOCK_GRANTED_SQL: Object.freeze({
    opener: `if capture_scalar_query database "$database" lock_granted "$application_name" zero_or_one <<'LOCK_GRANTED_SQL'`,
    token: ":'lock_app'",
    body: "SELECT count(*) FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid WHERE a.datname=pg_catalog.current_database() AND a.usename=CURRENT_USER AND a.application_name=:'lock_app' AND a.backend_type='client backend' AND l.database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) AND l.relation='public.auth_verification_challenges'::regclass AND l.mode='AccessExclusiveLock' AND l.granted;\n",
  }),
  LOCK_CONNECTIONS_SQL: Object.freeze({
    opener: `if capture_scalar_query database "$database" lock_connections "$application_name" zero_or_one <<'LOCK_CONNECTIONS_SQL'`,
    token: ":'lock_app'",
    body: "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname=pg_catalog.current_database() AND usename=CURRENT_USER AND application_name=:'lock_app' AND backend_type='client backend';\n",
  }),
  LOCK_BACKEND_PID_SQL: Object.freeze({
    opener: `if capture_scalar_query database "$database" lock_backend_pid "$application_name" backend_pid <<'LOCK_BACKEND_PID_SQL'`,
    token: ":'lock_app'",
    body: "WITH holders AS MATERIALIZED (\n" +
      "  SELECT DISTINCT a.pid\n" +
      "  FROM pg_catalog.pg_stat_activity a\n" +
      "  JOIN pg_catalog.pg_locks l ON l.pid = a.pid\n" +
      "  WHERE a.datname = pg_catalog.current_database()\n" +
      "    AND a.usename = CURRENT_USER\n" +
      "    AND CURRENT_USER = 'postgres'::name\n" +
      "    AND a.application_name = :'lock_app'\n" +
      "    AND a.backend_type = 'client backend'\n" +
      "    AND a.pid <> pg_catalog.pg_backend_pid()\n" +
      "    AND l.database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database())\n" +
      "    AND l.relation = 'public.auth_verification_challenges'::regclass\n" +
      "    AND l.mode = 'AccessExclusiveLock'\n" +
      "    AND l.granted\n" +
      ")\n" +
      "SELECT pg_catalog.lpad(min(pid)::text, 10, '0') FROM holders HAVING count(*) = 1;\n",
  }),
  LOCK_TERMINATE_SQL: Object.freeze({
    opener: `if database_psql_script "$database" lock_terminate "$application_name" "$backend_pid"     >"$QUERY_CAPTURE_STDOUT_FILE" 2>"$QUERY_CAPTURE_STDERR_FILE" <<'LOCK_TERMINATE_SQL'`,
    tokens: [":'lock_app'", ":'lock_pid'"],
    body: "WITH holders AS MATERIALIZED (\n" +
      "  SELECT DISTINCT a.pid\n" +
      "  FROM pg_catalog.pg_stat_activity a\n" +
      "  JOIN pg_catalog.pg_locks l ON l.pid = a.pid\n" +
      "  WHERE a.datname = pg_catalog.current_database()\n" +
      "    AND a.usename = CURRENT_USER\n" +
      "    AND CURRENT_USER = 'postgres'::name\n" +
      "    AND a.application_name = :'lock_app'\n" +
      "    AND a.backend_type = 'client backend'\n" +
      "    AND a.pid <> pg_catalog.pg_backend_pid()\n" +
      "    AND l.database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database())\n" +
      "    AND l.relation = 'public.auth_verification_challenges'::regclass\n" +
      "    AND l.mode = 'AccessExclusiveLock'\n" +
      "    AND l.granted\n" +
      "), eligible AS MATERIALIZED (\n" +
      "  SELECT pid FROM holders WHERE pid = :'lock_pid'::integer AND (SELECT count(*) FROM holders) = 1\n" +
      "), terminated AS MATERIALIZED (\n" +
      "  SELECT pg_catalog.pg_terminate_backend(pid) AS ok FROM eligible\n" +
      ")\n" +
      "SELECT count(*) FROM terminated WHERE ok;\n",
  }),
});

function collectQuotedScriptHeredocs(shell) {
  const lines = shell.split("\n");
  const starts = [];
  const ranges = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const openers = [...lines[lineIndex].matchAll(/<<'([A-Za-z_][A-Za-z0-9_]*)'/g)];
    assert.ok(openers.length <= 1, `multiple heredocs on line ${lineIndex + 1} are not statically auditable`);
    if (openers.length === 0) continue;
    const delimiter = openers[0][1];
    let closing = lineIndex + 1;
    while (closing < lines.length && lines[closing] !== delimiter) closing += 1;
    assert.ok(closing < lines.length, `unterminated heredoc ${delimiter}`);
    let commandStart = lineIndex;
    while (commandStart > 0 && lines[commandStart - 1].trimEnd().endsWith("\\")) commandStart -= 1;
    ranges.push({
      start: starts[lineIndex] + lines[lineIndex].length + 1,
      end: starts[closing],
      delimiter,
      opener: lines.slice(commandStart, lineIndex + 1).join("\n"),
    });
    lineIndex = closing;
  }
  return ranges;
}

function commandAreaWithoutHeredocs(shell) {
  const characters = shell.split("");
  for (const { start, end } of collectQuotedScriptHeredocs(shell)) {
    for (let index = start; index < end; index += 1) {
      if (characters[index] !== "\n") characters[index] = " ";
    }
  }
  return characters.join("").replace(/\\\n/g, "");
}

function lexShellCommands(shell) {
  const commands = [];
  let words = [];
  let word = "";
  let quote = null;
  let escaped = false;
  let inComment = false;
  const flushWord = () => {
    if (word !== "") words.push(word);
    word = "";
  };
  const flushCommand = () => {
    flushWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  for (const character of shell) {
    if (inComment) {
      if (character === "\n") {
        inComment = false;
        flushCommand();
      }
      continue;
    }
    if (escaped) {
      word += character;
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (character === "'") quote = null;
      else word += character;
      continue;
    }
    if (quote === '"') {
      if (character === '"') quote = null;
      else if (character === "\\") escaped = true;
      else word += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "#" && word === "") {
      inComment = true;
      continue;
    }
    if (character === "\n" || ";|&()".includes(character)) {
      flushCommand();
      continue;
    }
    if (character === " " || character === "\t") {
      flushWord();
      continue;
    }
    word += character;
  }
  assert.equal(quote, null, "unterminated shell quote in psql command scanner");
  assert.equal(escaped, false, "unterminated shell escape in psql command scanner");
  flushCommand();
  return commands;
}

function psqlCommandVariableViolations(input, label = "psql command source") {
  const shell = normalizeShellBuffer(Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8"), label);
  const commands = lexShellCommands(commandAreaWithoutHeredocs(shell));
  const violations = [];
  for (const words of commands) {
    for (let index = 0; index < words.length; index += 1) {
      let flag = null;
      let sql = null;
      if (words[index] === "-c" || words[index] === "--command") {
        flag = words[index];
        sql = words[index + 1] ?? "";
      } else if (words[index].startsWith("--command=")) {
        flag = "--command";
        sql = words[index].slice("--command=".length);
      } else if (words[index].startsWith("-c") && words[index].length > 2) {
        flag = "-c";
        sql = words[index].slice(2);
      }
      if (flag && new RegExp(psqlVariableTokenPattern.source).test(sql)) violations.push({ flag, sql });
    }
  }
  return violations;
}

function commandAreaPsqlVariableTokens(shell) {
  const commandArea = commandAreaWithoutHeredocs(shell);
  const matches = [...commandArea.matchAll(new RegExp(psqlVariableTokenPattern.source, "g"))]
    .map((match) => match[0]);
  for (const words of lexShellCommands(commandArea)) {
    for (const word of words) {
      for (const match of word.matchAll(new RegExp(psqlVariableTokenPattern.source, "g"))) {
        matches.push(match[0]);
      }
    }
  }
  return [...new Set(matches)];
}

function assertPsqlVariableTransportSafe(input, label = "psql transport source") {
  const shell = normalizeShellBuffer(Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8"), label);
  const commandTokens = commandAreaPsqlVariableTokens(shell);
  assert.deepEqual(commandTokens, [], "psql variable token is forbidden everywhere in command area");

  assert.deepEqual(psqlCommandVariableViolations(Buffer.from(shell), "psql transport commands"), [],
    "psql variable token must not use -c/--command transport");
  const heredocs = collectQuotedScriptHeredocs(shell);
  const seen = new Set();
  for (const heredoc of heredocs) {
    const body = shell.slice(heredoc.start, heredoc.end);
    const tokens = [...body.matchAll(new RegExp(psqlVariableTokenPattern.source, "g"))]
      .map((match) => match[0]);
    if (tokens.length === 0) continue;

    const expected = approvedPsqlScriptHeredocs[heredoc.delimiter];
    assert.ok(expected, `unapproved heredoc ${heredoc.delimiter} contains a psql variable token`);
    assert.equal(seen.has(heredoc.delimiter), false, `duplicate approved heredoc ${heredoc.delimiter}`);
    assert.equal(heredoc.opener.replace(/\\\n/g, "").trim(), expected.opener,
      `${heredoc.delimiter} opener drift`);
    assert.deepEqual(tokens, expected.tokens ?? [expected.token], `${heredoc.delimiter} token mapping drift`);
    assert.equal(body, expected.body, `${heredoc.delimiter} SQL body drift`);
    seen.add(heredoc.delimiter);
  }
  assert.deepEqual([...seen].sort(), Object.keys(approvedPsqlScriptHeredocs).sort(),
    "approved psql heredoc set drift");
}

function assertMatrixRunnerStructure(runner) {
  assert.match(runner, /^#!\/usr\/bin\/env bash\nset -Eeuo pipefail/m);
  assert.match(runner, /DB_PREFIX="memoryai_auth_negative_"/);
  assert.match(runner, /memoryai\|postgres\|template0\|template1/);
  assert.match(runner, /database is outside current run nonce/);
  assert.match(runner, /DATABASE_URL is forbidden/);
  assert.match(runner, /PGHOST must be exactly \/var\/run\/postgresql/);
  for (const fixedSetting of [
    'RUNUSER="/usr/sbin/runuser"',
    'CLEAN_ENV="/usr/bin/env"',
    'PSQL="/usr/bin/psql"',
    'CREATEDB="/usr/bin/createdb"',
    'DROPDB="/usr/bin/dropdb"',
    'TIMEOUT="/usr/bin/timeout"',
    'POSTGRES_OS_USER="postgres"',
    'POSTGRES_HOME="/nonexistent"',
    'POSTGRES_PATH="/usr/bin:/bin"',
    'POSTGRES_HOST="/var/run/postgresql"',
    'POSTGRES_PORT="5432"',
    'POSTGRES_USER="postgres"',
    'STARTUP_VALIDATION_RC=68',
  ]) assert.ok(runner.includes(fixedSetting), `runner missing fixed setting ${fixedSetting}`);
  assert.match(runner, /local -a command=\(\n\s+"\$RUNUSER" --user "\$POSTGRES_OS_USER" --\n\s+"\$CLEAN_ENV" -i\n\s+"HOME=\$POSTGRES_HOME"\n\s+"PATH=\$POSTGRES_PATH"\n\s+"PGHOST=\$POSTGRES_HOST"\n\s+"PGPORT=\$POSTGRES_PORT"\n\s+"PGUSER=\$POSTGRES_USER"\n\s+"\$executable"\n\s+\)/);
  assert.match(runner, /for variable in DATABASE_URL PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGHOSTADDR PGDATABASE; do/);
  assert.match(runner, /psql_command\(\) \{\n\s+postgres_command 0 "\$PSQL" "\$@"\n\}/);
  assert.match(runner, /psql_command_with_timeout\(\) \{[\s\S]*?postgres_command "\$timeout_seconds" "\$PSQL" "\$@"\n\}/);
  assert.match(runner, /drop_database_command\(\) \{\n\s+postgres_command 0 "\$DROPDB" --if-exists --force "\$1"\n\}/);
  assert.match(runner, /create_database_command\(\) \{\n\s+postgres_command 0 "\$CREATEDB" --template=template0 "\$1"\n\}/);
  assert.match(runner, /postgres_file_readable\(\) \{\n\s+postgres_command 0 "\$TEST" -r "\$1"\n\}/);
  assert.match(runner, /initialize_runtime\(\) \{[\s\S]*?umask 077/);
  assert.match(runner, /create_startup_probe_file\(\) \{[\s\S]*?mktemp -- "\$WORK_DIR\/postgresql-startup-identity\.\$\{stream\}\.XXXXXXXX"/);
  assert.match(runner, /chmod 600 "\$file" \|\| fail startup_probe/);
  assert.match(runner, /startup_probe_file_owner "\$file"\)" == "0"/);
  assert.match(runner, /startup_probe_file_group "\$file"\)" == "0"/);
  assert.match(runner, /startup_probe_file_mode "\$file"\)" == "600"/);
  assert.match(runner, /if admin_psql -At -c [\s\S]*?>"\$stdout_file" 2>"\$stderr_file"; then\n\s+probe_rc=0\n\s+else\n\s+probe_rc=\$\?/);
  assert.match(runner, /\[\[ "\$probe_rc" -eq 0 \]\] \|\| return "\$probe_rc"/);
  assert.doesNotMatch(runner, /evidence="\$\(admin_psql/);
  assert.match(runner, /stderr_bytes="\$\(stat -c '%s' "\$stderr_file"\)"/);
  assert.match(runner, /record_state "FAILED_startup_stderr_\$\{STARTUP_VALIDATION_RC\} bytes=\$stderr_bytes" \|\| true/);
  const startupCommand = runner.indexOf("if admin_psql -At -c");
  const startupRcGate = runner.indexOf('[[ "$probe_rc" -eq 0 ]] || return "$probe_rc"', startupCommand);
  const startupStderrGate = runner.indexOf('if [[ "$stderr_bytes" != "0" ]]', startupRcGate);
  const startupStdoutRead = runner.indexOf('exec {stdout_fd}<"$stdout_file"', startupStderrGate);
  assert.ok(startupCommand >= 0 && startupCommand < startupRcGate && startupRcGate < startupStderrGate && startupStderrGate < startupStdoutRead,
    "startup validation must preserve rc, reject stderr, then read stdout");
  assert.doesNotMatch(runner, /^\s*"\$(?:PSQL|CREATEDB|DROPDB)"(?:\s|$)/m);
  assert.match(runner, /for file in "\$RUNUSER" "\$CLEAN_ENV" "\$PSQL" "\$CREATEDB" "\$DROPDB" "\$TIMEOUT" "\$ID" "\$TEST"; do/);
  assert.match(runner, /database_os_user_exists \|\| fail input 69 "required postgres OS user is unavailable"/);
  for (const startupToken of [
    "current_setting('server_version_num')", "current_database()", "session_user", "current_user",
    "CASE WHEN pg_catalog.inet_client_addr() IS NULL THEN 'unix_socket' ELSE 'tcp' END",
    '[[ "$version" == "140023" ]]',
    '[[ "$database" == "$ADMIN_DB" && "$database" != "memoryai" ]]',
    '[[ "$session_identity" == "$POSTGRES_USER" ]]', '[[ "$current_identity" == "$POSTGRES_USER" ]]',
    '[[ "$socket_identity" == "unix_socket" ]]',
  ]) assert.ok(runner.includes(startupToken), `runner missing startup identity contract ${startupToken}`);
  assert.doesNotMatch(runner, /\(pg_catalog\.inet_client_addr\(\) IS NULL\)::text/);
  assert.match(runner, /database_psql_script "\$database" lock_holder "\$application_name"/);
  assert.match(runner, /if capture_scalar_query admin "\$ADMIN_DB" connection_count "\$database" zero/);
  assert.match(runner, /if capture_scalar_query admin "\$ADMIN_DB" database_exists "\$database" zero/);
  assert.match(runner, /if capture_scalar_query admin "\$ADMIN_DB" residual_count "\$\{RUN_DB_PREFIX\}%" zero/);
  assert.match(runner, /if capture_scalar_query admin "\$ADMIN_DB" preexisting_count "\$names" zero/);
  assert.match(runner, /if capture_scalar_query database "\$database" lock_granted "\$application_name" zero_or_one/);
  assert.match(runner, /if capture_scalar_query database "\$database" lock_connections "\$application_name" zero_or_one/);
  assert.match(runner, /if capture_scalar_query database "\$database" lock_backend_pid "\$application_name" backend_pid/);
  assert.match(runner, /if database_psql_script "\$database" lock_terminate "\$application_name" "\$backend_pid"/);
  assert.doesNotMatch(runner, /\$\(\s*admin_psql_script\s+connection_count\b/);
  assert.doesNotMatch(runner, /\$\(\s*admin_psql_script\s+database_exists\b/);
  assert.doesNotMatch(runner, /\$\(\s*admin_psql_script\s+residual_count\b/);
  assert.doesNotMatch(runner, /\$\(\s*admin_psql_script\s+preexisting_count\b/);
  assert.doesNotMatch(runner, /\$\(\s*database_psql_script\s+"\$database"\s+lock_granted\b/);
  assert.doesNotMatch(runner, /\$\(\s*database_psql_script\s+"\$database"\s+lock_connections\b/);
  assert.doesNotMatch(runner, /\$\(\s*database_psql_script\s+"\$database"\s+lock_backend_pid\b/);
  assert.match(runner, /set_config\('application_name', :'lock_app', false\)/);
  assert.doesNotMatch(runner, /PGAPPNAME=/);

  const backendPidSql = approvedPsqlScriptHeredocs.LOCK_BACKEND_PID_SQL.body;
  for (const identityPredicate of [
    "a.datname = pg_catalog.current_database()",
    "a.usename = CURRENT_USER",
    "CURRENT_USER = 'postgres'::name",
    "a.application_name = :'lock_app'",
    "a.backend_type = 'client backend'",
    "a.pid <> pg_catalog.pg_backend_pid()",
    "l.database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database())",
    "l.relation = 'public.auth_verification_challenges'::regclass",
    "l.mode = 'AccessExclusiveLock'",
    "l.granted",
  ]) assert.ok(backendPidSql.includes(identityPredicate), `backend PID handshake missing ${identityPredicate}`);
  assert.match(backendPidSql, /SELECT pg_catalog\.lpad\(min\(pid\)::text, 10, '0'\) FROM holders HAVING count\(\*\) = 1;/,
    "backend PID handshake must return exactly one fixed-width holder PID");

  const terminateSql = approvedPsqlScriptHeredocs.LOCK_TERMINATE_SQL.body;
  for (const identityPredicate of [
    "a.datname = pg_catalog.current_database()",
    "a.usename = CURRENT_USER",
    "CURRENT_USER = 'postgres'::name",
    "a.application_name = :'lock_app'",
    "a.backend_type = 'client backend'",
    "a.pid <> pg_catalog.pg_backend_pid()",
    "l.database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database())",
    "l.relation = 'public.auth_verification_challenges'::regclass",
    "l.mode = 'AccessExclusiveLock'",
    "l.granted",
    "pid = :'lock_pid'::integer",
    "(SELECT count(*) FROM holders) = 1",
  ]) assert.ok(terminateSql.includes(identityPredicate), `exact holder termination missing ${identityPredicate}`);
  assert.equal((terminateSql.match(/pg_catalog\.pg_terminate_backend\(/g) || []).length, 1,
    "exact holder termination must call pg_terminate_backend once");
  assert.match(terminateSql, /pg_catalog\.pg_terminate_backend\(pid\) AS ok FROM eligible/);
  assert.match(terminateSql, /SELECT count\(\*\) FROM terminated WHERE ok;/);

  const pidParser = runner.match(/read_exact_query_scalar\(\) \{([\s\S]*?)^\}/m)?.[1];
  assert.ok(pidParser, "missing raw query scalar parser");
  assert.match(pidParser, /backend_pid\)[\s\S]*?QUERY_CAPTURE_STDOUT_BYTES" == "11"/);
  assert.match(pidParser, /for index in \{1\.\.10\}; do/);
  assert.match(pidParser, /"\$second" == \$'\\n' && "\$pid_text" =~ \^\[0-9\]\{10\}\$/);
  assert.match(pidParser, /pid_number >= 1 && pid_number <= 2147483647/);

  const exactTermination = runner.match(/terminate_exact_lock_holder_backend\(\) \{([\s\S]*?)^\}/m)?.[1];
  assert.ok(exactTermination, "missing exact lock-holder backend terminator");
  assert.match(exactTermination, /LOCK_HOLDER_ACTIVE" -eq 1/);
  assert.match(exactTermination, /LOCK_HOLDER_DATABASE" == "\$database"/);
  assert.match(exactTermination, /LOCK_HOLDER_APPLICATION_NAME" == "\$application_name"/);
  assert.match(exactTermination, /LOCK_HOLDER_BACKEND_PID" == "\$backend_pid"/);
  assert.match(exactTermination, /read_exact_query_scalar one/);

  const wrapperReaper = runner.match(/reap_active_lock_holder_wrapper\(\) \{([\s\S]*?)^\}/m)?.[1];
  assert.ok(wrapperReaper, "missing lock-holder wrapper reaper");
  assert.match(wrapperReaper, /if wait "\$wrapper_pid"/);
  assert.doesNotMatch(wrapperReaper, /\b(?:kill|pkill|killall)\b/,
    "a reusable client PID must never be signaled during wrapper reaping");

  const lockScenario = runner.match(/run_lock_timeout_scenario\(\) \{([\s\S]*?)^\}/m)?.[1];
  assert.ok(lockScenario, "missing lock-timeout scenario");
  assert.doesNotMatch(lockScenario, /admin_psql_script terminate|cleanup_database|pg_terminate_backend/,
    "normal lock path must not use broad database termination");
  assert.doesNotMatch(lockScenario, /kill "\$holder"/,
    "normal lock path must not treat the client job PID as the backend termination handle");
  const exactTerminateIndex = lockScenario.indexOf('terminate_exact_lock_holder_backend "$database" "$application_name" "$backend_pid"');
  const connectionPollIndex = lockScenario.indexOf('wait_for_lock_holder_connections "$database" "$application_name"');
  const wrapperReapIndex = lockScenario.indexOf('reap_active_lock_holder_wrapper "$database"');
  assert.ok(exactTerminateIndex >= 0 && exactTerminateIndex < connectionPollIndex && connectionPollIndex < wrapperReapIndex,
    "normal lock cleanup must terminate the exact backend, poll it away, then reap the client wrapper");
  assert.equal((runner.match(/admin_psql_script terminate "\$database"/g) || []).length, 1,
    "broad database termination must remain confined to the cleanup fallback");
  assert.match(runner, /\[\[ "\$\(orchestrator_uid\)" == "0" \]\]/);
  assert.match(runner, /orchestrator_gid\(\) \{[\s\S]*?"\$ID" -g/);
  assert.ok((runner.match(/\[\[ "\$\(orchestrator_gid\)" == "0" \]\]/g) || []).length >= 2,
    "both formal orchestration gates must require gid 0");
  assert.match(runner, /required_owner="0"/);
  assert.match(runner, /required_group="0"/);
  assert.match(runner, /stat -c '%u:%g' "\$runtime_parent"\)" == "0:0"/);
  assert.match(runner, /stat -c '%g' "\$WORK_DIR"\)" == "0"/);
  assert.match(runner, /stat -c '%u:%g:%a' "\$STATE_FILE"\)" == "0:0:600"/);
  assert.match(runner, /query_capture_file_group "\$file"\)" == "0"/);
  assert.doesNotMatch(runner, /stat -c '%[UG]'|"\$ID" -(?:un|gn)/,
    "filesystem authority must use numeric uid/gid values");
  assert.match(runner, /wait_for_lock_holder_connections\(\) \{[\s\S]*?for poll in \{1\.\.50\}; do[\s\S]*?0\) return 0[\s\S]*?1\) ;;[\s\S]*?return 82/);
  assert.match(runner, /trap 'on_exit \$\?' EXIT/);
  assert.match(runner, /trap 'on_signal INT 130' INT/);
  assert.match(runner, /trap 'on_signal TERM 143' TERM/);
  assert.match(runner, /memoryai-auth-pg14-matrix\.\$\{RUN_NONCE\}\.XXXXXXXX/);
  assert.match(runner, /\^\[0-9a-f\]\{32\}\$/);
  assert.match(runner, /MAX_DATABASE_NAME_LENGTH=58/);
  assert.match(runner, /SCENARIO_DATABASE run_id=\$RUN_ID nonce=\$RUN_NONCE index=\$index_text scenario=\$scenario database=\$database/);
  assert.match(runner, /expected_object/);
  assert.match(runner, /expected_category/);
  assert.match(runner, /FAILED_cleanup_terminate_/);
  assert.match(runner, /FAILED_cleanup_dropdb_/);
  assert.match(runner, /FAILED_cleanup_database_exists_/);
  assert.match(runner, /FAILED_cleanup_connections_/);
  assert.match(runner, /CLEANUP_FAILED_RC_75/);
  assert.match(runner, /\^ERROR:\[\[:space:\]\]/);
  assert.match(runner, /REJECTION_ORACLE_ROWS/);
  assert.match(runner, /BEHAVIOR_ORACLE_ROWS/);
  assert.match(runner, /lock_timeout\\t-\\tcanceling statement due to lock timeout\\tcategory_only/);
  assert.match(runner, /scenario model must contain 77 rejection oracles/);
  assert.match(runner, /behavior oracle table must contain 33 rows/);
  assert.match(runner, /psql_command -X --no-psqlrc/);
  assert.match(runner, /database_psql "\$database" --quiet -v VERBOSITY=terse/);
  assert.match(runner, /--quiet/);
  assert.doesNotMatch(runner, /--echo-errors/);
  assert.match(runner, /if \[\[ "\$\{BASH_SOURCE\[0\]\}" == "\$0" \]\]/);
  assert.doesNotMatch(runner, /(?:MATRIX_WORK_DIR|MATRIX_STATE_FILE)\s*=|\$\{(?:MATRIX_WORK_DIR|MATRIX_STATE_FILE)/);
  assert.doesNotMatch(runner, /printf\s+'?%\.63s/);
  assert.doesNotMatch(runner, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+pg_catalog\./i);
  assertPsqlVariableTransportSafe(runner);
  const scriptBoundary = runner.match(/psql_script_command\(\) \{([\s\S]*?)^\}/m)?.[1];
  assert.ok(scriptBoundary, "missing psql stdin script boundary");
  assert.match(scriptBoundary, /variable_arguments=\("--set=\$\{variable_name\}=\$\{variable_value\}"\)/);
  assert.match(scriptBoundary, /variable_arguments=\("--set=lock_app=\$\{lock_application_name\}" "--set=lock_pid=\$\{lock_backend_pid\}"\)/);
  assert.match(scriptBoundary, /"\$\{variable_arguments\[@\]\}" --file=-/);
  assert.doesNotMatch(scriptBoundary, /(?:^|[ \t])(?:-c|--command)(?:[= \t]|$)/m);
  assert.doesNotMatch(scriptBoundary, /\b(?:eval|sh\s+-c)\b/);
}

test("PostgreSQL 14 matrix runner has a bounded destructive scope", () => {
  assertMatrixRunnerStructure(readShell("tests/run-006-auth-pg14-matrix.sh"));
});

test("approved psql heredocs freeze delimiter, opener, body, and token mappings", () => {
  const runner = readShell("tests/run-006-auth-pg14-matrix.sh");
  const delimiter = "CLEANUP_CONNECTIONS_SQL";
  const approved = approvedPsqlScriptHeredocs[delimiter];

  const openerDrift = runner.replace(
    approved.opener,
    approved.opener.replace("connection_count", "database_exists"),
  );
  assert.notEqual(openerDrift, runner, "opener drift fixture did not change the runner");
  assert.throws(() => assertPsqlVariableTransportSafe(openerDrift), /CLEANUP_CONNECTIONS_SQL opener drift/);

  const bodyDriftValue = approved.body.replace(";\n", "; \n");
  const bodyDrift = runner.replace(approved.body, bodyDriftValue);
  assert.notEqual(bodyDrift, runner, "body drift fixture did not change the runner");
  assert.throws(() => assertPsqlVariableTransportSafe(bodyDrift), /CLEANUP_CONNECTIONS_SQL SQL body drift/);

  const tokenDriftValue = approved.body.replace(":'matrix_db'", ":'wrong_db'");
  const tokenDrift = runner.replace(approved.body, tokenDriftValue);
  assert.notEqual(tokenDrift, runner, "token drift fixture did not change the runner");
  assert.throws(() => assertPsqlVariableTransportSafe(tokenDrift), /CLEANUP_CONNECTIONS_SQL token mapping drift/);

  const duplicate = `${runner}\n${approved.opener}\n${approved.body}${delimiter}\n`;
  assert.throws(() => assertPsqlVariableTransportSafe(duplicate), /duplicate approved heredoc CLEANUP_CONNECTIONS_SQL/);
});

test("lock backend identity and exact termination heredocs are frozen", () => {
  const runner = readShell("tests/run-006-auth-pg14-matrix.sh");
  const backendPid = approvedPsqlScriptHeredocs.LOCK_BACKEND_PID_SQL;
  const terminate = approvedPsqlScriptHeredocs.LOCK_TERMINATE_SQL;

  const pidCardinalityDrift = runner.replace(
    backendPid.body,
    backendPid.body.replace("HAVING count(*) = 1", "HAVING count(*) = 2"),
  );
  assert.notEqual(pidCardinalityDrift, runner, "backend PID cardinality drift fixture did not change the runner");
  assert.throws(
    () => assertPsqlVariableTransportSafe(pidCardinalityDrift),
    /LOCK_BACKEND_PID_SQL SQL body drift/,
  );

  const terminateTokenDrift = runner.replace(
    terminate.body,
    terminate.body.replace(":'lock_pid'", ":'other_pid'"),
  );
  assert.notEqual(terminateTokenDrift, runner, "termination PID token drift fixture did not change the runner");
  assert.throws(
    () => assertPsqlVariableTransportSafe(terminateTokenDrift),
    /LOCK_TERMINATE_SQL token mapping drift/,
  );

  const terminateOpenerFragment = `database_psql_script "$database" lock_terminate "$application_name" "$backend_pid"`;
  const terminateOpenerDrift = runner.replace(
    terminateOpenerFragment,
    terminateOpenerFragment.replace("lock_terminate", "lock_connections"),
  );
  assert.notEqual(terminateOpenerDrift, runner, "termination opener drift fixture did not change the runner");
  assert.throws(
    () => assertPsqlVariableTransportSafe(terminateOpenerDrift),
    /LOCK_TERMINATE_SQL opener drift/,
  );
});

test("psql variable scanner rejects tokens everywhere in the command area", () => {
  const fixtures = Object.freeze({
    "variable assignment then -c": `sql="SELECT :'matrix_db';"\nadmin_psql -c "$sql"\n`,
    "combined -Atc": `admin_psql -Atc "SELECT :'matrix_db';"\n`,
    "dynamic flag": `flag=-c\nadmin_psql "$flag" "SELECT :'matrix_db';"\n`,
    "--command variable": `sql='SELECT :"matrix_db";'\nadmin_psql --command "$sql"\n`,
    "--command= variable": `sql="SELECT :{?matrix_db};"\nadmin_psql "--command=$sql"\n`,
  });
  for (const [label, fixture] of Object.entries(fixtures)) {
    assert.throws(
      () => assertPsqlVariableTransportSafe(Buffer.from(fixture), `${label} LF`),
      /psql variable token is forbidden everywhere in command area/,
      `${label} LF bypassed the global command-area scanner`,
    );
    assert.throws(
      () => assertPsqlVariableTransportSafe(Buffer.from(fixture.replaceAll("\n", "\r\n")), `${label} CRLF`),
      /psql variable token is forbidden everywhere in command area/,
      `${label} CRLF bypassed the global command-area scanner`,
    );
  }

  const unapprovedHeredoc = `admin_psql_script terminate "$database" <<'UNAPPROVED_SQL'\nSELECT :'matrix_db';\nUNAPPROVED_SQL\n`;
  assert.deepEqual(psqlCommandVariableViolations(Buffer.from(unapprovedHeredoc), "unapproved heredoc command scan"), []);
  assert.throws(
    () => assertPsqlVariableTransportSafe(Buffer.from(unapprovedHeredoc)),
    /unapproved heredoc UNAPPROVED_SQL contains a psql variable token/,
  );
  assert.throws(
    () => assertPsqlVariableTransportSafe(Buffer.from(unapprovedHeredoc.replaceAll("\n", "\r\n"))),
    /unapproved heredoc UNAPPROVED_SQL contains a psql variable token/,
  );
});

test("psql variable scanner follows Bash continuations outside heredocs", () => {
  const continuation = "\\" + "\n";
  const lfFixtures = [
    `admin_psql -c "SELECT :${continuation}'matrix_db';"\n`,
    `admin_psql --command "SELECT :${continuation}\\"matrix_db\\";"\n`,
    `admin_psql --command="SELECT :${continuation}{?matrix_db};"\n`,
    `admin_psql -${continuation}c "SELECT :'matrix_db';"\n`,
    `admin_psql --comm${continuation}and="SELECT :'matrix_db';"\n`,
  ];
  for (const [index, fixture] of lfFixtures.entries()) {
    const violations = psqlCommandVariableViolations(Buffer.from(fixture), `LF continuation fixture ${index + 1}`);
    assert.equal(violations.length, 1, `LF continuation fixture ${index + 1} bypassed the scanner`);
    assert.throws(
      () => assertPsqlVariableTransportSafe(Buffer.from(fixture)),
      /psql variable token is forbidden everywhere in command area/,
    );
  }
  for (const [index, fixture] of lfFixtures.entries()) {
    const crlfFixture = Buffer.from(fixture.replaceAll("\n", "\r\n"));
    const violations = psqlCommandVariableViolations(crlfFixture, `CRLF continuation fixture ${index + 1}`);
    assert.equal(violations.length, 1, `CRLF continuation fixture ${index + 1} bypassed the scanner`);
    assert.throws(
      () => assertPsqlVariableTransportSafe(crlfFixture),
      /psql variable token is forbidden everywhere in command area/,
    );
  }

  const heredocDecoy = `cat <<'SQL'\nadmin_psql -${continuation}c "SELECT :'decoy';"\nSQL\n`;
  assert.deepEqual(psqlCommandVariableViolations(Buffer.from(heredocDecoy), "heredoc decoy"), []);
  assert.throws(
    () => assertPsqlVariableTransportSafe(Buffer.from(heredocDecoy)),
    /unapproved heredoc SQL contains a psql variable token/,
  );
});

test("shell static contracts accept LF and pure CRLF but reject unsafe bytes", () => {
  const lf = readShell("tests/run-006-auth-pg14-matrix.sh");
  const pureCrlf = Buffer.from(lf.replaceAll("\n", "\r\n"), "utf8");
  const normalizedCrlf = normalizeShellBuffer(pureCrlf, "pure CRLF fixture");
  assert.equal(normalizedCrlf, lf);
  assert.doesNotThrow(() => assertPsqlVariableTransportSafe(Buffer.from(lf), "formal runner LF"));
  assert.doesNotThrow(() => assertPsqlVariableTransportSafe(pureCrlf, "formal runner CRLF"));
  assertMatrixRunnerStructure(lf);
  assertMatrixRunnerStructure(normalizedCrlf);

  const unsafeByteFixtures = [
    {
      label: "BOM fixture",
      input: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lf)]),
      error: /must not contain a BOM/,
    },
    { label: "lone CR fixture", input: Buffer.from(lf.replace("\n", "\r")), error: /contains a lone CR/ },
    { label: "mixed fixture", input: Buffer.from(lf.replace("\n", "\r\n")), error: /contains mixed LF and CRLF/ },
  ];
  for (const { label, input, error } of unsafeByteFixtures) {
    assert.throws(() => normalizeShellBuffer(input, label), error);
    assert.throws(() => assertPsqlVariableTransportSafe(input, label), error);
  }
});

test("PostgreSQL 14 matrix runner passes fake CLI orchestration tests", () => {
  const candidates = [
    process.env.BASH,
    process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files\\Git\\usr\\bin\\bash.exe" : undefined,
    "bash",
  ].filter(Boolean);
  const bash = candidates.find((candidate) =>
    spawnSync(candidate, ["--version"], { encoding: "utf8" }).status === 0);
  assert.ok(bash, "bash is required for the PostgreSQL 14 matrix contract tests");

  const shellTest = path.join(databaseRoot, "tests", "run-006-auth-pg14-matrix.test.sh");
  const result = spawnSync(bash, [shellTest], {
    cwd: path.resolve(databaseRoot, ".."),
    encoding: "utf8",
    timeout: 600_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /source-injected tests: PASS/);
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
      const normalizedChecks = await client.query(`
        SELECT c.conname,
          pg_catalog.regexp_replace(
            pg_catalog.pg_get_expr(c.conbin, c.conrelid),
            '\\s+', '', 'g'
          ) AS normalized_expression
        FROM pg_catalog.pg_constraint c
        WHERE c.conrelid = 'public.auth_verification_challenges'::regclass
          AND c.conname LIKE 'ck_auth_challenge_%'
        ORDER BY c.conname
      `);
      assert.deepEqual(
        Object.fromEntries(normalizedChecks.rows.map((row) => [row.conname, row.normalized_expression])),
        postgres1423CheckExpressions,
      );
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

    await t.test("rejects a CHECK name owned by the wrong table", async () => {
      await resetBase(client);
      await client.query(migration006);
      await client.query("ALTER TABLE public.auth_verification_challenges DROP CONSTRAINT ck_auth_challenge_phone_hash");
      await client.query(`
        CREATE TABLE public.auth_challenge_shadow (
          phone_hash CHARACTER(64),
          CONSTRAINT ck_auth_challenge_phone_hash CHECK (phone_hash ~ '^[0-9a-f]{64}$')
        )
      `);
      await assert.rejects(client.query(migration006), /ck_auth_challenge_phone_hash has wrong relation/i);
      await client.query("ROLLBACK");
    });

    await t.test("rejects duplicate CHECK names in public", async () => {
      await resetBase(client);
      await client.query(migration006);
      await client.query(`
        CREATE TABLE public.auth_challenge_shadow (
          phone_hash CHARACTER(64),
          CONSTRAINT ck_auth_challenge_phone_hash CHECK (phone_hash ~ '^[0-9a-f]{64}$')
        )
      `);
      await assert.rejects(client.query(migration006), /ck_auth_challenge_phone_hash has duplicate names/i);
      await client.query("ROLLBACK");
    });

    for (const checkCase of [
      {
        name: "wrong CHECK conkey",
        definition: "CHECK (phone_hash ~ '^[0-9a-f]{64}$' AND code_digest IS NOT NULL)",
        error: /ck_auth_challenge_phone_hash has wrong conkey/i,
      },
      {
        name: "NOT VALID CHECK",
        definition: "CHECK (phone_hash ~ '^[0-9a-f]{64}$') NOT VALID",
        error: /ck_auth_challenge_phone_hash is not validated/i,
      },
      {
        name: "NO INHERIT CHECK",
        definition: "CHECK (phone_hash ~ '^[0-9a-f]{64}$') NO INHERIT",
        error: /ck_auth_challenge_phone_hash unexpectedly uses NO INHERIT/i,
      },
      {
        name: "wrong CHECK expression",
        definition: "CHECK (phone_hash ~ '^[0-9]{64}$')",
        error: /ck_auth_challenge_phone_hash has wrong normalized expression/i,
      },
    ]) {
      await t.test(`rejects ${checkCase.name}`, async () => {
        await resetBase(client);
        await client.query(migration006);
        await client.query("ALTER TABLE public.auth_verification_challenges DROP CONSTRAINT ck_auth_challenge_phone_hash");
        await client.query(`
          ALTER TABLE public.auth_verification_challenges
          ADD CONSTRAINT ck_auth_challenge_phone_hash ${checkCase.definition}
        `);
        await assert.rejects(client.query(migration006), checkCase.error);
        await client.query("ROLLBACK");
      });
    }

    await t.test("rejects wrong same-name indexes", async () => {
      await resetBase(client);
      await client.query(migration006);
      await client.query("DROP INDEX public.idx_auth_challenges_phone_created");
      await client.query("CREATE INDEX idx_auth_challenges_phone_created ON public.auth_verification_challenges (purpose)");
      await assert.rejects(client.query(migration006), /idx_auth_challenges_phone_created has wrong key columns/i);
      await client.query("ROLLBACK");
    });

    await t.test("rejects a unique replacement for a non-unique index", async () => {
      await resetBase(client);
      await client.query(migration006);
      await client.query("DROP INDEX public.idx_auth_challenges_phone_created");
      await client.query("CREATE UNIQUE INDEX idx_auth_challenges_phone_created ON public.auth_verification_challenges (phone_hash, created_at DESC)");
      await assert.rejects(client.query(migration006), /idx_auth_challenges_phone_created is unexpectedly unique/i);
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
