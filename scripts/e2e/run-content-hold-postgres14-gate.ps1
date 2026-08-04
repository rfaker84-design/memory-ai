[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$PostgresBin,[string]$DataDirectory)
$ErrorActionPreference="Stop"
function Get-Port { $l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0); try{$l.Start();return ([System.Net.IPEndPoint]$l.LocalEndpoint).Port}finally{$l.Stop()} }
$root=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path; $bin=(Resolve-Path -LiteralPath $PostgresBin).Path
foreach($file in @("initdb.exe","pg_ctl.exe","pg_isready.exe","postgres.exe")){if(-not(Test-Path -LiteralPath(Join-Path $bin $file))){throw "CONTENT_HOLD_PG14_BINARY_MISSING=$file"}}
$postgres=Join-Path $bin "postgres.exe"; $version=(& $postgres --version).Trim(); if($version -notmatch "^postgres \(PostgreSQL\) 14\.23(?:\D|$)"){throw "CONTENT_HOLD_PG14_VERSION_REQUIRED=$version"}
if(-not $DataDirectory){$DataDirectory=Join-Path([IO.Path]::GetTempPath())("memoryai-content-hold-pg14-"+[guid]::NewGuid().ToString("N"))}; if(Test-Path -LiteralPath $DataDirectory){throw "CONTENT_HOLD_PG14_DATA_DIRECTORY_MUST_NOT_EXIST=$DataDirectory"}; New-Item -ItemType Directory -Path $DataDirectory|Out-Null
$port=Get-Port; $pgCtl=Join-Path $bin "pg_ctl.exe"; $pgReady=Join-Path $bin "pg_isready.exe"; $process=$null; $saved=@{}; foreach($key in @("CONTENT_HOLD_POSTGRES_GATE_ADMIN_URL","CONTENT_HOLD_POSTGRES_GATE_DATABASE","CONTENT_HOLD_POSTGRES_GATE_ALLOW_DROP")){$saved[$key]=[Environment]::GetEnvironmentVariable($key,"Process")}
try{
  & (Join-Path $bin "initdb.exe") -D $DataDirectory -U postgres -A trust --no-locale --encoding UTF8|Out-Null;if($LASTEXITCODE-ne 0){throw "CONTENT_HOLD_PG14_INITDB_FAILED=$LASTEXITCODE"}
  $process=Start-Process -FilePath $postgres -ArgumentList @("-D",$DataDirectory,"-h","127.0.0.1","-p",$port) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $DataDirectory "postgres.log") -RedirectStandardError (Join-Path $DataDirectory "postgres.err.log") -PassThru
  $ready=$false;foreach($i in 1..30){& $pgReady -h 127.0.0.1 -p $port -U postgres|Out-Null;if($LASTEXITCODE-eq 0){$ready=$true;break};Start-Sleep -Seconds 1};if(-not $ready){throw "CONTENT_HOLD_PG14_START_FAILED"}
  [Environment]::SetEnvironmentVariable("CONTENT_HOLD_POSTGRES_GATE_ADMIN_URL","postgresql://postgres@127.0.0.1:$port/postgres","Process");[Environment]::SetEnvironmentVariable("CONTENT_HOLD_POSTGRES_GATE_DATABASE","content_hold_gate_"+[guid]::NewGuid().ToString("N").Substring(0,16),"Process");[Environment]::SetEnvironmentVariable("CONTENT_HOLD_POSTGRES_GATE_ALLOW_DROP","YES","Process")
  Push-Location $root;try{npm.cmd run test:content-hold-postgres;if($LASTEXITCODE-ne 0){throw "CONTENT_HOLD_PG14_INTEGRATION_GATE_FAILED=$LASTEXITCODE"}}finally{Pop-Location};"CONTENT_HOLD_PG14_PASS version=$version port=$port migrations=22"
}finally{
  if($process -and -not $process.HasExited){& $pgCtl -D $DataDirectory -m fast -w stop|Out-Null;if($LASTEXITCODE-ne 0){throw "CONTENT_HOLD_PG14_NATURAL_STOP_FAILED=$LASTEXITCODE"};$process.Refresh();if(-not $process.HasExited){throw "CONTENT_HOLD_PG14_PROCESS_STILL_RUNNING"}}
  foreach($key in $saved.Keys){[Environment]::SetEnvironmentVariable($key,$saved[$key],"Process")};if(Test-Path -LiteralPath $DataDirectory){$resolved=(Resolve-Path -LiteralPath $DataDirectory).Path;$temp=[IO.Path]::GetTempPath().TrimEnd('\');if(-not $resolved.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase)-or -not(Split-Path -Leaf $resolved).StartsWith("memoryai-content-hold-pg14-")){throw "CONTENT_HOLD_PG14_CLEANUP_SCOPE_INVALID=$resolved"};Remove-Item -LiteralPath $resolved -Recurse -Force}
}
