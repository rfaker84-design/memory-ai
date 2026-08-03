[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$PostgresBin, [string]$DataDirectory)
$ErrorActionPreference = "Stop"
function Get-LoopbackPort { $l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0); try{$l.Start();return ([System.Net.IPEndPoint]$l.LocalEndpoint).Port}finally{$l.Stop()} }
$root=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$bin=(Resolve-Path -LiteralPath $PostgresBin).Path
foreach($name in @("initdb.exe","pg_ctl.exe","pg_isready.exe","postgres.exe","psql.exe")){if(-not(Test-Path -LiteralPath (Join-Path $bin $name))){throw "VIDEO_SHARE_PG14_BINARY_MISSING=$name"}}
$postgres=Join-Path $bin "postgres.exe"; $psql=Join-Path $bin "psql.exe"; $ctl=Join-Path $bin "pg_ctl.exe"; $ready=Join-Path $bin "pg_isready.exe"
$version=(& $postgres --version).Trim(); if($version -notmatch "^postgres \(PostgreSQL\) 14\.23(?:\D|$)"){throw "VIDEO_SHARE_PG14_VERSION_REQUIRED=$version"}
if(-not $DataDirectory){$DataDirectory=Join-Path ([IO.Path]::GetTempPath()) ("memoryai-video-share-pg14-"+[guid]::NewGuid().ToString("N"))}
if(Test-Path -LiteralPath $DataDirectory){throw "VIDEO_SHARE_PG14_DATA_DIRECTORY_MUST_NOT_EXIST=$DataDirectory"}; New-Item -ItemType Directory -Path $DataDirectory|Out-Null
$port=Get-LoopbackPort; $db="video_share_gate_"+[guid]::NewGuid().ToString("N").Substring(0,16); $rollback="video_share_rollback_"+[guid]::NewGuid().ToString("N").Substring(0,12); $process=$null
function Invoke-Psql([string]$database,[string[]]$arguments){& $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d $database @arguments; if($LASTEXITCODE -ne 0){throw "VIDEO_SHARE_PG14_PSQL_FAILED=$LASTEXITCODE"}}
try {
  & (Join-Path $bin "initdb.exe") -D $DataDirectory -U postgres -A trust --no-locale --encoding UTF8|Out-Null; if($LASTEXITCODE -ne 0){throw "VIDEO_SHARE_PG14_INITDB_FAILED=$LASTEXITCODE"}
  $process=Start-Process -FilePath $postgres -ArgumentList @("-D",$DataDirectory,"-h","127.0.0.1","-p",$port) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $DataDirectory "postgres.log") -RedirectStandardError (Join-Path $DataDirectory "postgres.err.log") -PassThru
  $up=$false; foreach($n in 1..30){& $ready -h 127.0.0.1 -p $port -U postgres|Out-Null;if($LASTEXITCODE -eq 0){$up=$true;break};Start-Sleep -Seconds 1};if(-not $up){throw "VIDEO_SHARE_PG14_START_FAILED"}
  Invoke-Psql "postgres" @("-c","CREATE DATABASE $db"); Invoke-Psql "postgres" @("-c","CREATE DATABASE $rollback")
  $base=Get-ChildItem -LiteralPath (Join-Path $root "database\migrations") -Filter "*.sql" | Where-Object { $_.Name -match '^0(?:0[1-9]|1[0-6])_' } | Sort-Object Name
  foreach($file in $base){Invoke-Psql $db @("-f",$file.FullName)}
  $migration=Join-Path $root "database\migrations\021_video_share_links.sql"; Invoke-Psql $db @("-f",$migration); Invoke-Psql $db @("-f",$migration)
  Invoke-Psql $db @("-f",(Join-Path $root "database\verification\021-video-share-links-postflight.sql"))
  & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d $rollback -f $migration | Out-Null; if($LASTEXITCODE -eq 0){throw "VIDEO_SHARE_PG14_FAILURE_ROLLBACK_DID_NOT_FAIL"}
  $exists=& $psql -X -At -h 127.0.0.1 -p $port -U postgres -d $rollback -c "SELECT pg_catalog.to_regclass('public.video_share_links') IS NOT NULL"; if($LASTEXITCODE -ne 0 -or $exists.Trim() -ne "f"){throw "VIDEO_SHARE_PG14_FAILURE_ROLLBACK_TABLE_PRESENT"}
  "VIDEO_SHARE_PG14_PASS version=$version port=$port database=$db migrations=17"
} finally {
  if($process -and -not $process.HasExited){& $ctl -D $DataDirectory -m fast -w stop|Out-Null;if($LASTEXITCODE -ne 0){throw "VIDEO_SHARE_PG14_NATURAL_STOP_FAILED=$LASTEXITCODE"};$process.Refresh();if(-not $process.HasExited){throw "VIDEO_SHARE_PG14_PROCESS_STILL_RUNNING"}}
  if(Test-Path -LiteralPath $DataDirectory){$resolved=(Resolve-Path -LiteralPath $DataDirectory).Path;$temp=[IO.Path]::GetTempPath().TrimEnd('\');if(-not $resolved.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase)-or -not(Split-Path -Leaf $resolved).StartsWith("memoryai-video-share-pg14-")){throw "VIDEO_SHARE_PG14_CLEANUP_SCOPE_INVALID=$resolved"};Remove-Item -LiteralPath $resolved -Recurse -Force}
}
