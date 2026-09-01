[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^/home/ubuntu/memoryai-staging/tools/qwen-e2e-[0-9a-f]{40}/staging-qwen-secret-ingest\.cjs$')]
  [string]$IngestTool
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-PlainSecret([Security.SecureString]$Value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Normalize-CustomizationEndpoint([string]$InputValue) {
  $value = $InputValue.Trim().ToLowerInvariant()
  $workspace = $null
  if ($value -match '^[a-z0-9-]{1,63}$') {
    $workspace = $value
  } elseif ($value -match '^https://([a-z0-9-]{1,63})\.cn-beijing\.maas\.aliyuncs\.com/api/v1/services/audio/tts/customization$') {
    $workspace = $Matches[1]
  } elseif ($value -match '^([a-z0-9-]{1,63})\.cn-beijing\.maas\.aliyuncs\.com$') {
    $workspace = $Matches[1]
  }
  if (-not $workspace) { throw 'STAGING_QWEN_WORKSPACE_OR_HOST_INVALID' }
  return "https://${workspace}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization"
}

function Invoke-SecretIngest([string]$RemoteTool, [string]$ApiKey, [string]$Endpoint) {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'ssh'
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  [void]$startInfo.ArgumentList.Add('memoryai-prod')
  [void]$startInfo.ArgumentList.Add('node')
  [void]$startInfo.ArgumentList.Add($RemoteTool)

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw 'STAGING_QWEN_SECRET_INGEST_START_FAILED' }
  try {
    $payload = [PSCustomObject]@{ apiKey = $ApiKey; endpoint = $Endpoint } | ConvertTo-Json -Compress
    $process.StandardInput.Write($payload)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd().Trim()
    $stderr = $process.StandardError.ReadToEnd().Trim()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0 -or $stdout -ne 'STAGING_QWEN_SECRET_STORED mode=0600') {
      if ($stderr -match 'code=([A-Z0-9_]+)') { throw "STAGING_QWEN_SECRET_INGEST_FAILED_$($Matches[1])" }
      throw 'STAGING_QWEN_SECRET_INGEST_FAILED'
    }
  } finally {
    $process.Dispose()
  }
}

$secureApiKey = Read-Host -Prompt 'DASHSCOPE_API_KEY (hidden)' -AsSecureString
$workspaceOrHost = Read-Host -Prompt 'Workspace ID, host, or canonical customization endpoint'
$endpoint = Normalize-CustomizationEndpoint $workspaceOrHost
$apiKey = Get-PlainSecret $secureApiKey
try {
  Invoke-SecretIngest -RemoteTool $IngestTool -ApiKey $apiKey -Endpoint $endpoint
  Write-Output 'STAGING_QWEN_SECRET_STORED mode=0600'
} finally {
  $apiKey = $null
  $secureApiKey.Dispose()
}
