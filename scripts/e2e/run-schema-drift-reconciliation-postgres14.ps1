[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PostgresBin,
  [string]$DataDirectory
)

$ErrorActionPreference = "Stop"

function Get-LoopbackPort {
  $listener = [System.Net.Sockets.TcpListener]::new(
    [System.Net.IPAddress]::Loopback,
    0
  )
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Invoke-Psql {
  param(
    [Parameter(Mandatory = $true)] [string[]]$Arguments,
    [switch]$Capture
  )

  if ($Capture) {
    $result = & $script:psql @Arguments
    if ($LASTEXITCODE -ne 0) { throw "POSTGRES14_PSQL_FAILED=$LASTEXITCODE" }
    return $result
  }

  & $script:psql @Arguments
  if ($LASTEXITCODE -ne 0) { throw "POSTGRES14_PSQL_FAILED=$LASTEXITCODE" }
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$postgresBinPath = (Resolve-Path -LiteralPath $PostgresBin).Path
foreach ($executable in @("initdb.exe", "pg_ctl.exe", "pg_isready.exe", "postgres.exe", "psql.exe")) {
  if (-not (Test-Path -LiteralPath (Join-Path $postgresBinPath $executable))) {
    throw "POSTGRES14_BINARY_MISSING=$executable"
  }
}

$postgres = Join-Path $postgresBinPath "postgres.exe"
$version = (& $postgres --version).Trim()
if ($version -notmatch "^postgres \(PostgreSQL\) 14\.23(?:\D|$)") {
  throw "POSTGRES14_VERSION_REQUIRED=$version"
}

if (-not $DataDirectory) {
  $DataDirectory = Join-Path ([System.IO.Path]::GetTempPath()) (
    "memoryai-pg14-schema-drift-" + [guid]::NewGuid().ToString("N")
  )
}
if (Test-Path -LiteralPath $DataDirectory) {
  throw "POSTGRES14_DATA_DIRECTORY_MUST_NOT_EXIST=$DataDirectory"
}

$script:initDb = Join-Path $postgresBinPath "initdb.exe"
$script:pgCtl = Join-Path $postgresBinPath "pg_ctl.exe"
$pgIsReady = Join-Path $postgresBinPath "pg_isready.exe"
$script:psql = Join-Path $postgresBinPath "psql.exe"
$port = Get-LoopbackPort
$postgresProcess = $null
$originalEnvironment = @{}
foreach ($key in @(
  "MEMORYAI_TEST_DATABASE_URL",
  "CHAT_SESSION_POSTGRES_GATE_ADMIN_URL",
  "CHAT_SESSION_POSTGRES_GATE_DATABASE",
  "CHAT_SESSION_POSTGRES_GATE_ALLOW_DROP",
  "COMMERCE_POSTGRES_GATE_ADMIN_URL",
  "COMMERCE_POSTGRES_GATE_DATABASE",
  "COMMERCE_POSTGRES_GATE_ALLOW_DROP",
  "MEDIA_LOCAL_GATE_ADMIN_URL",
  "MEDIA_LOCAL_GATE_DATABASE",
  "MEDIA_LOCAL_GATE_ALLOW_DROP"
)) {
  $originalEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
}

try {
  New-Item -ItemType Directory -Path $DataDirectory | Out-Null
  & $script:initDb -D $DataDirectory -U postgres -A trust --no-locale --encoding UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "POSTGRES14_INITDB_FAILED=$LASTEXITCODE" }

  $logFile = Join-Path $DataDirectory "postgres.log"
  $errorLogFile = Join-Path $DataDirectory "postgres.err.log"
  $postgresProcess = Start-Process -FilePath $postgres -ArgumentList @(
    "-D", $DataDirectory, "-h", "127.0.0.1", "-p", $port
  ) -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError $errorLogFile -PassThru

  $started = $false
  foreach ($attempt in 1..30) {
    & $pgIsReady -h 127.0.0.1 -p $port -U postgres | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $started = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $started) { throw "POSTGRES14_START_FAILED" }

  $adminUrl = "postgresql://postgres@127.0.0.1:$port/postgres"
  $driftDatabase = "schema_drift_gate_" + [guid]::NewGuid().ToString("N").Substring(0, 12)
  $driftUrl = "postgresql://postgres@127.0.0.1:$port/$driftDatabase"
  Invoke-Psql -Arguments @("-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", "postgres", "-c", "CREATE DATABASE $driftDatabase")

  $initial = @(
    "001_memoryai_core.sql",
    "002_memoryai_indexes.sql",
    "003_memoryai_constraints.sql",
    "006_auth_verification_challenges.sql",
    "007_long_term_memories.sql",
    "008_memory_first_greetings.sql",
    "009_memory_chat_turn_idempotency.sql"
  )
  foreach ($file in $initial) {
    Invoke-Psql -Arguments @("-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $driftDatabase, "-f", (Join-Path $projectRoot "database\migrations\$file"))
  }

  function Invoke-LockRollbackProbe {
    param(
      [Parameter(Mandatory = $true)] [string]$Migration,
      [Parameter(Mandatory = $true)] [string]$LockTable,
      [string[]]$PriorMigrations = @(),
      [string]$AbsentRelation,
      [string]$AbsentColumn
    )

    $probeDatabase = "schema_drift_lock_" + [guid]::NewGuid().ToString("N").Substring(0, 12)
    $lockProcess = $null
    try {
      Invoke-Psql -Arguments @("-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", "postgres", "-c", "CREATE DATABASE $probeDatabase")
      foreach ($file in ($initial + $PriorMigrations)) {
        Invoke-Psql -Arguments @("-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $probeDatabase, "-f", (Join-Path $projectRoot "database\migrations\$file"))
      }

      $lockLog = Join-Path $DataDirectory "lock-$Migration.log"
      $lockError = Join-Path $DataDirectory "lock-$Migration.err.log"
      $lockSql = "BEGIN; LOCK TABLE public.$LockTable IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(4); COMMIT;"
      $lockArguments = "-X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d $probeDatabase -c `"$lockSql`""
      $lockProcess = Start-Process -FilePath $script:psql -ArgumentList $lockArguments -WindowStyle Hidden -RedirectStandardOutput $lockLog -RedirectStandardError $lockError -PassThru
      $lockHeld = $false
      foreach ($attempt in 1..30) {
        $lockHeldResult = Invoke-Psql -Capture -Arguments @(
          "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $probeDatabase,
          "-c", "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_class c ON c.oid = l.relation WHERE c.relnamespace = 'public'::regnamespace AND c.relname = '$LockTable' AND l.mode = 'AccessExclusiveLock' AND l.granted);"
        )
        if (($lockHeldResult -join "") -eq "t") {
          $lockHeld = $true
          break
        }
        Start-Sleep -Milliseconds 100
      }
      if (-not $lockHeld) { throw "LOCK_PROBE_LOCK_NOT_ACQUIRED=$Migration" }

      & $script:psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d $probeDatabase -f (Join-Path $projectRoot "database\migrations\$Migration") | Out-Null
      if ($LASTEXITCODE -eq 0) { throw "LOCK_PROBE_EXPECTED_FAILURE=$Migration" }
      $migrationExit = $LASTEXITCODE
      Wait-Process -Id $lockProcess.Id
      $lockProcess = $null

      if ($AbsentRelation) {
        $relationExists = Invoke-Psql -Capture -Arguments @(
          "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $probeDatabase,
          "-c", "SELECT pg_catalog.to_regclass('public.$AbsentRelation') IS NOT NULL;"
        )
        if (($relationExists -join "") -ne "f") { throw "LOCK_PROBE_LEFT_PARTIAL_RELATION=$Migration" }
      }
      if ($AbsentColumn) {
        $columnExists = Invoke-Psql -Capture -Arguments @(
          "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $probeDatabase,
          "-c", "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.$LockTable'::regclass AND attname = '$AbsentColumn' AND NOT attisdropped);"
        )
        if (($columnExists -join "") -ne "f") { throw "LOCK_PROBE_LEFT_PARTIAL_COLUMN=$Migration" }
      }
      "LOCK_ROLLBACK_OK=$Migration exit=$migrationExit"
    } finally {
      if ($lockProcess -and -not $lockProcess.HasExited) {
        Wait-Process -Id $lockProcess.Id
      }
    }
  }

  $missing = Invoke-Psql -Capture -Arguments @(
    "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $driftDatabase,
    "-c", "SELECT NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.media_assets'::regclass AND attname = 'sha256' AND NOT attisdropped), NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.memories'::regclass AND attname = 'creation_idempotency_key' AND NOT attisdropped);"
  )
  if (($missing -join "") -ne "t|t") { throw "DRIFT_SHAPE_MISMATCH=$missing" }

  Invoke-Psql -Arguments @(
    "-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $driftDatabase,
    "-c", "WITH new_user AS (INSERT INTO public.users (external_id) VALUES ('s22-drift-owner') RETURNING id), new_memory AS (INSERT INTO public.memories (user_id, name, idempotency_key) SELECT id, 'S22 preserved memory', repeat('a', 64) FROM new_user RETURNING id, user_id) INSERT INTO public.media_assets (user_id, memory_id, media_type, status, storage_key) SELECT user_id, id, 'IMAGE', 'UPLOADED', 'legacy/s22-photo.png' FROM new_memory;"
  )

  $catchUp = @(
    "004_media_storage_foundation.sql",
    "005_memory_creation_idempotency.sql",
    "010_memory_experience_payments.sql",
    "011_business_funnel_events.sql",
    "012_payment_refund_requests.sql",
    "013_wechat_auth_identities.sql",
    "014_commerce_credits_referrals.sql"
  )
  foreach ($file in $catchUp) {
    $path = Join-Path $projectRoot "database\migrations\$file"
    foreach ($attempt in 1..2) {
      Invoke-Psql -Arguments @("-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $driftDatabase, "-f", $path)
    }
  }

  Invoke-Psql -Arguments @(
    "-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $driftDatabase,
    "-c", "WITH owner AS (SELECT id AS user_id FROM public.users WHERE external_id = 's22-drift-owner'), memory AS (SELECT id AS memory_id FROM public.memories WHERE name = 'S22 preserved memory'), first_conversation AS (INSERT INTO public.conversations (user_id, memory_id, title, created_at) SELECT owner.user_id, memory.memory_id, 'Older', now() - interval '1 minute' FROM owner, memory RETURNING id, user_id, memory_id), second_conversation AS (INSERT INTO public.conversations (user_id, memory_id, title) SELECT user_id, memory_id, 'Newer' FROM first_conversation RETURNING id, user_id, memory_id) INSERT INTO public.messages (conversation_id, user_id, memory_id, role, content) SELECT second_conversation.id, second_conversation.user_id, second_conversation.memory_id, 'assistant', 'preserved message' FROM second_conversation;"
  )
  $migration015 = Join-Path $projectRoot "database\migrations\015_chat_default_session_atomicity.sql"
  foreach ($attempt in 1..2) {
    Invoke-Psql -Arguments @("-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $driftDatabase, "-f", $migration015)
  }

  $preserved = Invoke-Psql -Capture -Arguments @(
    "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $driftDatabase,
    "-c", "SELECT (SELECT count(*) FROM public.media_assets WHERE storage_key = 'legacy/s22-photo.png'), (SELECT count(*) FROM public.messages WHERE content = 'preserved message'), (SELECT count(*) FROM public.conversations WHERE is_default);"
  )
  if (($preserved -join "") -ne "1|1|1") { throw "DRIFT_DATA_PRESERVATION_FAILED=$preserved" }

  $prior = @()
  foreach ($probe in @(
    @{ migration = "004_media_storage_foundation.sql"; lockTable = "media_assets"; column = "sha256" },
    @{ migration = "005_memory_creation_idempotency.sql"; lockTable = "memories"; column = "creation_idempotency_key" },
    @{ migration = "010_memory_experience_payments.sql"; lockTable = "memories"; relation = "payment_orders" },
    @{ migration = "011_business_funnel_events.sql"; lockTable = "users"; relation = "business_funnel_events" },
    @{ migration = "012_payment_refund_requests.sql"; lockTable = "users"; relation = "refund_requests" },
    @{ migration = "013_wechat_auth_identities.sql"; lockTable = "users"; relation = "auth_external_identities" },
    @{ migration = "014_commerce_credits_referrals.sql"; lockTable = "memories"; relation = "commerce_orders" },
    @{ migration = "015_chat_default_session_atomicity.sql"; lockTable = "conversations"; column = "is_default" }
  )) {
    Invoke-LockRollbackProbe -Migration $probe.migration -LockTable $probe.lockTable -PriorMigrations $prior -AbsentRelation $probe.relation -AbsentColumn $probe.column
    $prior += $probe.migration
  }

  foreach ($postflight in (Get-ChildItem -LiteralPath (Join-Path $projectRoot "database\verification") -Filter "*postflight.sql" | Sort-Object Name)) {
    Invoke-Psql -Arguments @("-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", $driftDatabase, "-f", $postflight.FullName)
  }

  $testDatabase = "schema_drift_sprint22_test"
  Invoke-Psql -Arguments @("-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $port, "-U", "postgres", "-d", "postgres", "-c", "CREATE DATABASE $testDatabase")
  [Environment]::SetEnvironmentVariable("MEMORYAI_TEST_DATABASE_URL", "postgresql://postgres@127.0.0.1:$port/$testDatabase", "Process")
  [Environment]::SetEnvironmentVariable("CHAT_SESSION_POSTGRES_GATE_ADMIN_URL", $adminUrl, "Process")
  [Environment]::SetEnvironmentVariable("CHAT_SESSION_POSTGRES_GATE_DATABASE", "chat_session_gate_s22", "Process")
  [Environment]::SetEnvironmentVariable("CHAT_SESSION_POSTGRES_GATE_ALLOW_DROP", "YES", "Process")
  [Environment]::SetEnvironmentVariable("COMMERCE_POSTGRES_GATE_ADMIN_URL", $adminUrl, "Process")
  [Environment]::SetEnvironmentVariable("COMMERCE_POSTGRES_GATE_DATABASE", "commerce_gate_s22", "Process")
  [Environment]::SetEnvironmentVariable("COMMERCE_POSTGRES_GATE_ALLOW_DROP", "YES", "Process")
  [Environment]::SetEnvironmentVariable("MEDIA_LOCAL_GATE_ADMIN_URL", $adminUrl, "Process")
  [Environment]::SetEnvironmentVariable("MEDIA_LOCAL_GATE_DATABASE", "media_gate_s22", "Process")
  [Environment]::SetEnvironmentVariable("MEDIA_LOCAL_GATE_ALLOW_DROP", "YES", "Process")

  Push-Location $projectRoot
  try {
    node --test database/tests/sprint15-migration-hardening.test.cjs
    if ($LASTEXITCODE -ne 0) { throw "S22_004_005_FAILURE_INJECTION_FAILED=$LASTEXITCODE" }
    .\node_modules\.bin\tsx.cmd --test features\chat\chat-session-atomicity.integration.test.ts
    if ($LASTEXITCODE -ne 0) { throw "S22_015_GATE_FAILED=$LASTEXITCODE" }
    .\node_modules\.bin\tsx.cmd --test features\commerce\commerce-postgres.integration.test.ts
    if ($LASTEXITCODE -ne 0) { throw "S22_014_GATE_FAILED=$LASTEXITCODE" }
    .\node_modules\.bin\tsx.cmd --test app\api\media\local-media-upload.integration.test.ts
    if ($LASTEXITCODE -ne 0) { throw "S22_MEDIA_GATE_FAILED=$LASTEXITCODE" }
    npm.cmd run test:memory-item
    if ($LASTEXITCODE -ne 0) { throw "S22_MEMORY_RECOVERY_FAILED=$LASTEXITCODE" }
    npm.cmd run test:first-greeting
    if ($LASTEXITCODE -ne 0) { throw "S22_FIRST_GREETING_FAILED=$LASTEXITCODE" }
  } finally {
    Pop-Location
  }

  "SCHEMA_DRIFT_RECONCILIATION_PASS version=$version port=$port drift_database=$driftDatabase data_directory=$DataDirectory"
} finally {
  if ($postgresProcess -and -not $postgresProcess.HasExited) {
    & $script:pgCtl -D $DataDirectory -m fast stop | Out-Null
    $postgresProcess.Refresh()
    if (-not $postgresProcess.HasExited) {
      Stop-Process -Id $postgresProcess.Id -Force
    }
  }
  foreach ($key in $originalEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($key, $originalEnvironment[$key], "Process")
  }
}
