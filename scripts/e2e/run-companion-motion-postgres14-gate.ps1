[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PostgresBin,
  [string]$DataDirectory
)

$ErrorActionPreference = "Stop"

function Get-LoopbackPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$postgresBinPath = (Resolve-Path -LiteralPath $PostgresBin).Path
foreach ($name in @("initdb.exe", "pg_ctl.exe", "pg_isready.exe", "postgres.exe")) {
  if (-not (Test-Path -LiteralPath (Join-Path $postgresBinPath $name))) {
    throw "COMPANION_MOTION_PG14_BINARY_MISSING=$name"
  }
}

$postgres = Join-Path $postgresBinPath "postgres.exe"
$version = (& $postgres --version).Trim()
if ($version -notmatch "^postgres \(PostgreSQL\) 14\.") {
  throw "COMPANION_MOTION_PG14_VERSION_REQUIRED=$version"
}

if (-not $DataDirectory) {
  $DataDirectory = Join-Path ([System.IO.Path]::GetTempPath()) (
    "memoryai-companion-motion-pg14-" + [guid]::NewGuid().ToString("N")
  )
}
if (Test-Path -LiteralPath $DataDirectory) {
  throw "COMPANION_MOTION_PG14_DATA_DIRECTORY_MUST_NOT_EXIST=$DataDirectory"
}
New-Item -ItemType Directory -Path $DataDirectory | Out-Null

$port = Get-LoopbackPort
$initDb = Join-Path $postgresBinPath "initdb.exe"
$pgCtl = Join-Path $postgresBinPath "pg_ctl.exe"
$pgIsReady = Join-Path $postgresBinPath "pg_isready.exe"
$gateDatabase = "companion_motion_gate_" + [guid]::NewGuid().ToString("N").Substring(0, 16)
$logFile = Join-Path $DataDirectory "postgres.log"
$errorLogFile = Join-Path $DataDirectory "postgres.err.log"
$postgresProcess = $null
$original = @{}
foreach ($key in @(
  "COMPANION_MOTION_PG14_ADMIN_URL",
  "COMPANION_MOTION_PG14_DATABASE",
  "COMPANION_MOTION_PG14_ALLOW_DROP",
  "DATABASE_URL",
  "DATABASE_SSL",
  "DATABASE_POOL_MAX"
)) {
  $original[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
}

try {
  & $initDb -D $DataDirectory -U postgres -A trust --no-locale --encoding UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "COMPANION_MOTION_PG14_INITDB_FAILED=$LASTEXITCODE" }

  $postgresProcess = Start-Process -FilePath $postgres -ArgumentList @(
    "-D", $DataDirectory, "-h", "127.0.0.1", "-p", $port
  ) -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError $errorLogFile -PassThru
  $ready = $false
  foreach ($attempt in 1..30) {
    & $pgIsReady -h 127.0.0.1 -p $port -U postgres | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "COMPANION_MOTION_PG14_START_FAILED" }

  $adminUrl = "postgresql://postgres@127.0.0.1:$port/postgres"
  [Environment]::SetEnvironmentVariable("COMPANION_MOTION_PG14_ADMIN_URL", $adminUrl, "Process")
  [Environment]::SetEnvironmentVariable("COMPANION_MOTION_PG14_DATABASE", $gateDatabase, "Process")
  [Environment]::SetEnvironmentVariable("COMPANION_MOTION_PG14_ALLOW_DROP", "YES", "Process")
  [Environment]::SetEnvironmentVariable("DATABASE_SSL", "false", "Process")
  [Environment]::SetEnvironmentVariable("DATABASE_POOL_MAX", "32", "Process")

  Push-Location $projectRoot
  try {
    npm.cmd run test:companion-motion-postgres
    if ($LASTEXITCODE -ne 0) {
      throw "COMPANION_MOTION_PG14_INTEGRATION_GATE_FAILED=$LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  "COMPANION_MOTION_PG14_PASS version=$version database=$gateDatabase migrations=28"
} finally {
  if ($postgresProcess -and -not $postgresProcess.HasExited) {
    & $pgCtl -D $DataDirectory -m fast -w stop | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "COMPANION_MOTION_PG14_NATURAL_STOP_FAILED=$LASTEXITCODE" }
  }
  foreach ($key in $original.Keys) {
    [Environment]::SetEnvironmentVariable($key, $original[$key], "Process")
  }
  if (Test-Path -LiteralPath $DataDirectory) {
    $resolved = (Resolve-Path -LiteralPath $DataDirectory).Path
    $tempRoot = [System.IO.Path]::GetTempPath().TrimEnd('\')
    if (-not $resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not (Split-Path -Leaf $resolved).StartsWith("memoryai-companion-motion-pg14-")) {
      throw "COMPANION_MOTION_PG14_CLEANUP_SCOPE_INVALID=$resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
