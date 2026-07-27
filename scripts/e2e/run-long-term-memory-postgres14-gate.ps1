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

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$postgresBinPath = (Resolve-Path -LiteralPath $PostgresBin).Path
$requiredExecutables = @("initdb.exe", "pg_ctl.exe", "psql.exe", "postgres.exe")
foreach ($executable in $requiredExecutables) {
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
    "memoryai-pg14-ltm-gate-" + [guid]::NewGuid().ToString("N")
  )
}
if (Test-Path -LiteralPath $DataDirectory) {
  throw "POSTGRES14_DATA_DIRECTORY_MUST_NOT_EXIST=$DataDirectory"
}
New-Item -ItemType Directory -Path $DataDirectory | Out-Null

$port = Get-LoopbackPort
$pgCtl = Join-Path $postgresBinPath "pg_ctl.exe"
$pgIsReady = Join-Path $postgresBinPath "pg_isready.exe"
$initDb = Join-Path $postgresBinPath "initdb.exe"
$psql = Join-Path $postgresBinPath "psql.exe"
$logFile = Join-Path $DataDirectory "postgres.log"
$errorLogFile = Join-Path $DataDirectory "postgres.err.log"
$postgresProcess = $null
$originalEnvironment = @{}
foreach ($key in @(
  "MEMORYAI_TEST_DATABASE_URL",
  "DATABASE_URL",
  "DATABASE_SSL",
  "DATABASE_POOL_MAX",
  "AUTH_ALLOWED_ORIGIN",
  "LLM_PROVIDER"
)) {
  $originalEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
}

try {
  & $initDb -D $DataDirectory -U postgres -A trust --no-locale --encoding UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "POSTGRES14_INITDB_FAILED=$LASTEXITCODE" }

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
    Start-Sleep -Seconds 1
  }
  if (-not $started) { throw "POSTGRES14_START_FAILED" }

  $availableMigrations = Get-ChildItem -LiteralPath (Join-Path $projectRoot "database\migrations") -Filter "*.sql" |
    Sort-Object Name
  $expected = 1..13 | ForEach-Object { "{0:D3}_" -f $_ }
  $migrations = @()
  foreach ($prefix in $expected) {
    $matches = @($availableMigrations | Where-Object { $_.Name.StartsWith($prefix) })
    if ($matches.Count -ne 1) {
      throw "POSTGRES14_MIGRATION_SET_INVALID=$prefix"
    }
    $migrations += $matches[0]
  }
  foreach ($migration in $migrations) {
    & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -f $migration.FullName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "POSTGRES14_MIGRATION_FAILED=$($migration.Name)" }
  }

  $databaseUrl = "postgresql://postgres@127.0.0.1:$port/postgres"
  [Environment]::SetEnvironmentVariable("MEMORYAI_TEST_DATABASE_URL", $databaseUrl, "Process")
  [Environment]::SetEnvironmentVariable("DATABASE_URL", $databaseUrl, "Process")
  [Environment]::SetEnvironmentVariable("DATABASE_SSL", "false", "Process")
  [Environment]::SetEnvironmentVariable("DATABASE_POOL_MAX", "4", "Process")
  [Environment]::SetEnvironmentVariable("AUTH_ALLOWED_ORIGIN", "http://localhost", "Process")
  [Environment]::SetEnvironmentVariable("LLM_PROVIDER", "mock", "Process")

  Push-Location $projectRoot
  try {
    npm run test:long-term-memory-postgres14-e2e
    if ($LASTEXITCODE -ne 0) { throw "POSTGRES14_MEMORY_E2E_FAILED=$LASTEXITCODE" }
  } finally {
    Pop-Location
  }

  "POSTGRES14_MEMORY_PASS version=$version port=$port migrations=$($migrations.Count) data_directory=$DataDirectory"
} finally {
  if ($postgresProcess -and -not $postgresProcess.HasExited) {
    & $pgCtl -D $DataDirectory -m fast stop | Out-Null
    $postgresProcess.Refresh()
    if (-not $postgresProcess.HasExited) {
      Stop-Process -Id $postgresProcess.Id -Force
    }
  }
  foreach ($key in $originalEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($key, $originalEnvironment[$key], "Process")
  }
}
