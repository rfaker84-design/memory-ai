[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PostgresBin,
  [string]$DataDirectory
)

$ErrorActionPreference = "Stop"

function Get-LoopbackPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try { $listener.Start(); return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port }
  finally { $listener.Stop() }
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$postgresBinPath = (Resolve-Path -LiteralPath $PostgresBin).Path
foreach ($name in @("initdb.exe", "pg_ctl.exe", "pg_isready.exe", "postgres.exe")) {
  if (-not (Test-Path -LiteralPath (Join-Path $postgresBinPath $name))) { throw "ACCOUNT_DELETION_PG14_BINARY_MISSING=$name" }
}
$postgres = Join-Path $postgresBinPath "postgres.exe"
$version = (& $postgres --version).Trim()
if ($version -notmatch "^postgres \(PostgreSQL\) 14\.23(?:\D|$)") { throw "ACCOUNT_DELETION_PG14_VERSION_REQUIRED=$version" }
if (-not $DataDirectory) { $DataDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("memoryai-account-deletion-pg14-" + [guid]::NewGuid().ToString("N")) }
if (Test-Path -LiteralPath $DataDirectory) { throw "ACCOUNT_DELETION_PG14_DATA_DIRECTORY_MUST_NOT_EXIST=$DataDirectory" }
New-Item -ItemType Directory -Path $DataDirectory | Out-Null

$port = Get-LoopbackPort
$initDb = Join-Path $postgresBinPath "initdb.exe"
$pgCtl = Join-Path $postgresBinPath "pg_ctl.exe"
$pgIsReady = Join-Path $postgresBinPath "pg_isready.exe"
$database = "account_deletion_gate_" + [guid]::NewGuid().ToString("N").Substring(0, 16)
$logFile = Join-Path $DataDirectory "postgres.log"
$errorLogFile = Join-Path $DataDirectory "postgres.err.log"
$postgresProcess = $null
$original = @{}
foreach ($key in @("ACCOUNT_DELETION_POSTGRES_GATE_ADMIN_URL", "ACCOUNT_DELETION_POSTGRES_GATE_DATABASE", "DATABASE_URL", "DATABASE_SSL", "DATABASE_POOL_MAX", "NODE_ENV")) { $original[$key] = [Environment]::GetEnvironmentVariable($key, "Process") }

try {
  & $initDb -D $DataDirectory -U postgres -A trust --no-locale --encoding UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "ACCOUNT_DELETION_PG14_INITDB_FAILED=$LASTEXITCODE" }
  $postgresProcess = Start-Process -FilePath $postgres -ArgumentList @("-D", $DataDirectory, "-h", "127.0.0.1", "-p", $port) -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError $errorLogFile -PassThru
  $ready = $false
  foreach ($attempt in 1..30) { & $pgIsReady -h 127.0.0.1 -p $port -U postgres | Out-Null; if ($LASTEXITCODE -eq 0) { $ready = $true; break }; Start-Sleep -Seconds 1 }
  if (-not $ready) { throw "ACCOUNT_DELETION_PG14_START_FAILED" }
  [Environment]::SetEnvironmentVariable("ACCOUNT_DELETION_POSTGRES_GATE_ADMIN_URL", "postgresql://postgres@127.0.0.1:$port/postgres", "Process")
  [Environment]::SetEnvironmentVariable("ACCOUNT_DELETION_POSTGRES_GATE_DATABASE", $database, "Process")
  [Environment]::SetEnvironmentVariable("DATABASE_SSL", "false", "Process")
  [Environment]::SetEnvironmentVariable("DATABASE_POOL_MAX", "4", "Process")
  [Environment]::SetEnvironmentVariable("NODE_ENV", "test", "Process")
  Push-Location $projectRoot
  try {
    npm.cmd run test:account-deletion-postgres; if ($LASTEXITCODE -ne 0) { throw "ACCOUNT_DELETION_PG14_INTEGRATION_GATE_FAILED=$LASTEXITCODE" }
    npm.cmd run test:financial-archive-postgres; if ($LASTEXITCODE -ne 0) { throw "ACCOUNT_DELETION_FINANCIAL_ARCHIVE_PG14_GATE_FAILED=$LASTEXITCODE" }
  }
  finally { Pop-Location }
  "ACCOUNT_DELETION_PG14_PASS version=$version port=$port database=$database migrations=17"
} finally {
  if ($postgresProcess -and -not $postgresProcess.HasExited) {
    & $pgCtl -D $DataDirectory -m fast -w stop | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "ACCOUNT_DELETION_PG14_NATURAL_STOP_FAILED=$LASTEXITCODE" }
    $postgresProcess.Refresh()
    if (-not $postgresProcess.HasExited) { throw "ACCOUNT_DELETION_PG14_PROCESS_STILL_RUNNING" }
  }
  foreach ($key in $original.Keys) { [Environment]::SetEnvironmentVariable($key, $original[$key], "Process") }
  if (Test-Path -LiteralPath $DataDirectory) {
    $resolved = (Resolve-Path -LiteralPath $DataDirectory).Path
    $tempRoot = [System.IO.Path]::GetTempPath().TrimEnd('\\')
    if (-not $resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Split-Path -Leaf $resolved).StartsWith("memoryai-account-deletion-pg14-")) { throw "ACCOUNT_DELETION_PG14_CLEANUP_SCOPE_INVALID=$resolved" }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
