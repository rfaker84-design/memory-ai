[CmdletBinding()]
param(
  [ValidatePattern('^/home/ubuntu/memoryai-staging/tools/qwen-e2e-[0-9a-f]{40}/staging-qwen-secret-ingest\.cjs$')]
  [string]$IngestTool,
  [switch]$Library
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$WorkspaceApiKeyPattern = '^sk-ws-[A-Za-z0-9._-]{1,506}$'
$EdgeWhitespace = [char[]]@(' ', "`t", "`r", "`n")

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

function Remove-CopyPollutionEdges([string]$InputValue) {
  $value = $InputValue
  for ($pass = 0; $pass -lt 4; $pass += 1) {
    # Trim first so a BOM copied after leading whitespace is reached on the
    # next operation; repeat to cover either ordering without touching the
    # key body.
    $value = $value.Trim($EdgeWhitespace)
    $value = $value -replace '^[\uFEFF\uFFFE]+', ''
  }
  return $value
}

function Remove-OneMatchingQuoteLayer([string]$InputValue) {
  if ($InputValue.Length -ge 2 -and (($InputValue[0] -eq "'" -and $InputValue[$InputValue.Length - 1] -eq "'") -or ($InputValue[0] -eq '"' -and $InputValue[$InputValue.Length - 1] -eq '"'))) {
    return $InputValue.Substring(1, $InputValue.Length - 2)
  }
  return $InputValue
}

function Normalize-WorkspaceApiKey([string]$InputValue) {
  $value = Remove-CopyPollutionEdges $InputValue
  $wasQuoted = $value.Length -ge 2 -and (($value[0] -eq "'" -and $value[$value.Length - 1] -eq "'") -or ($value[0] -eq '"' -and $value[$value.Length - 1] -eq '"'))
  if ($wasQuoted) { $value = Remove-OneMatchingQuoteLayer $value }
  if ($value.StartsWith('api ', [System.StringComparison]::Ordinal)) {
    $value = $value.Substring(4)
  } elseif ($value.StartsWith('DASHSCOPE_API_KEY=', [System.StringComparison]::Ordinal)) {
    $value = $value.Substring('DASHSCOPE_API_KEY='.Length)
  }
  $value = Remove-CopyPollutionEdges $value
  if (-not $wasQuoted) { $value = Remove-OneMatchingQuoteLayer $value }
  $value = Remove-CopyPollutionEdges $value
  return $value.Replace('\_', '_')
}

function Get-WorkspaceApiKeyDiagnostic([string]$RawValue, [string]$NormalizedValue) {
  $leading = 0
  while ($leading -lt $RawValue.Length -and $RawValue[$leading] -in $EdgeWhitespace) { $leading += 1 }
  $trailing = 0
  while ($trailing -lt ($RawValue.Length - $leading) -and $RawValue[$RawValue.Length - 1 - $trailing] -in $EdgeWhitespace) { $trailing += 1 }
  $bom = 0
  $nul = 0
  $control = 0
  foreach ($character in $RawValue.ToCharArray()) {
    if ([int][char]$character -in 0xFEFF, 0xFFFE) { $bom += 1 }
    if ([int][char]$character -eq 0) { $nul += 1; continue }
    if ([char]::GetUnicodeCategory($character) -eq [Globalization.UnicodeCategory]::Control) { $control += 1 }
  }
  $invalid = [System.Collections.Generic.List[string]]::new()
  for ($index = 0; $index -lt $NormalizedValue.Length; $index += 1) {
    $character = $NormalizedValue[$index]
    if (-not ([string]$character -match '^[A-Za-z0-9._-]$')) {
      $invalid.Add(('U+{0:X4}@{1}' -f [int][char]$character, ($index + 1)))
    }
  }
  $invalidText = if ($invalid.Count -eq 0) { 'none' } else { [string]::Join(',', $invalid) }
  $escapedUnderscores = [regex]::Matches($RawValue, '\\_').Count
  $prefix = $NormalizedValue.StartsWith('sk-ws-', [System.StringComparison]::Ordinal).ToString().ToLowerInvariant()
  return "length=$($RawValue.Length) starts_with_sk_ws=$prefix leading_whitespace=$leading trailing_whitespace=$trailing bom=$bom nul=$nul control=$control invalid_unicode=$invalidText backslash_adjacent_underscore=$escapedUnderscores"
}

function Test-WorkspaceApiKey([string]$InputValue) {
  return $InputValue -match $WorkspaceApiKeyPattern
}

function Invoke-SecretIngest([string]$RemoteTool, [string]$ApiKey, [string]$Endpoint, [switch]$ValidateOnly) {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'ssh'
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  [void]$startInfo.ArgumentList.Add('memoryai-prod')
  [void]$startInfo.ArgumentList.Add('node')
  [void]$startInfo.ArgumentList.Add($RemoteTool)
  if ($ValidateOnly) { [void]$startInfo.ArgumentList.Add('--validate-only') }

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
    $expected = if ($ValidateOnly) { 'STAGING_QWEN_SECRET_VALIDATED' } else { 'STAGING_QWEN_SECRET_STORED mode=0600' }
    if ($process.ExitCode -ne 0 -or $stdout -ne $expected) {
      if ($stderr -match 'code=([A-Z0-9_]+)') { throw "STAGING_QWEN_SECRET_INGEST_FAILED_$($Matches[1])" }
      throw 'STAGING_QWEN_SECRET_INGEST_FAILED'
    }
  } finally {
    $process.Dispose()
  }
}

if (-not $Library) {
  if ([string]::IsNullOrWhiteSpace($IngestTool)) { throw 'STAGING_QWEN_SECRET_INGEST_TOOL_REQUIRED' }
  $secureApiKey = Read-Host -Prompt 'DASHSCOPE_API_KEY (hidden)' -AsSecureString
  $apiKey = $null
  $normalizedApiKey = $null
  try {
    $workspaceOrHost = Read-Host -Prompt 'Workspace ID, host, or canonical customization endpoint'
    $endpoint = Normalize-CustomizationEndpoint $workspaceOrHost
    $apiKey = Get-PlainSecret $secureApiKey
    $normalizedApiKey = Normalize-WorkspaceApiKey $apiKey
    $diagnostic = Get-WorkspaceApiKeyDiagnostic $apiKey $normalizedApiKey
    if (-not (Test-WorkspaceApiKey $normalizedApiKey)) {
      Write-Output "STAGING_QWEN_SECRET_INPUT_DIAGNOSTIC $diagnostic"
      throw 'STAGING_QWEN_SECRET_CLIENT_KEY_INVALID'
    }
    try {
      Invoke-SecretIngest -RemoteTool $IngestTool -ApiKey $normalizedApiKey -Endpoint $endpoint
    } catch {
      if ($_.Exception.Message -match 'KEY_INVALID') { Write-Output "STAGING_QWEN_SECRET_INPUT_DIAGNOSTIC $diagnostic" }
      throw
    }
    Write-Output 'STAGING_QWEN_SECRET_STORED mode=0600'
  } finally {
    $normalizedApiKey = $null
    $apiKey = $null
    $secureApiKey.Dispose()
  }
}
