[CmdletBinding()]
param(
  [ValidatePattern('^/home/ubuntu/memoryai-staging/tools/qwen-e2e-[0-9a-f]{40}/staging-qwen-secret-ingest\.cjs$')]
  [string]$IngestTool,
  [switch]$Library
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$WorkspaceApiKeyExactPattern = '^sk-ws-[A-Za-z0-9._-]{20,1024}$'
$WorkspaceApiKeyCandidatePattern = '(?<![A-Za-z0-9._-])sk-ws-[A-Za-z0-9._-]{20,1024}(?![A-Za-z0-9._-])'
$EdgeWhitespace = [char[]]@(' ', "`t", "`r", "`n")
$ConfirmedStagingWorkspaceHost = 'ws-cmmyzutudtc0w6kb.cn-beijing.maas.aliyuncs.com'

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

function Normalize-ClipboardText([string]$InputValue) {
  $value = Remove-CopyPollutionEdges $InputValue
  $value = Remove-OneMatchingQuoteLayer $value
  $value = Remove-CopyPollutionEdges $value
  return $value.Replace('\_', '_')
}

function Find-UniqueWorkspaceApiKey([string]$InputValue) {
  Set-Variable -Name matchCollection -Value ([regex]::Matches($InputValue, $WorkspaceApiKeyCandidatePattern)) -Scope Local
  if ($matchCollection.Count -ne 1) { return $null }
  return [string]$matchCollection[0].Value
}

function Test-WorkspaceApiKey([string]$InputValue) {
  return $InputValue -match $WorkspaceApiKeyExactPattern
}

function Get-WorkspaceApiKeyDiagnostic([string]$RawValue, [string]$NormalizedValue, [string]$Candidate) {
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
  $inspectionTarget = if ([string]::IsNullOrEmpty($Candidate)) { $NormalizedValue } else { $Candidate }
  $invalid = [System.Collections.Generic.List[string]]::new()
  for ($index = 0; $index -lt $inspectionTarget.Length; $index += 1) {
    $character = $inspectionTarget[$index]
    if (-not ([string]$character -match '^[A-Za-z0-9._-]$')) {
      $invalid.Add(('U+{0:X4}@{1}' -f [int][char]$character, ($index + 1)))
    }
  }
  $invalidText = if ($invalid.Count -eq 0) { 'none' } else { [string]::Join(',', $invalid) }
  $escapedUnderscores = [regex]::Matches($RawValue, '\\_').Count
  $prefix = $inspectionTarget.StartsWith('sk-ws-', [System.StringComparison]::Ordinal).ToString().ToLowerInvariant()
  return "length=$($RawValue.Length) starts_with_sk_ws=$prefix leading_whitespace=$leading trailing_whitespace=$trailing bom=$bom nul=$nul control=$control invalid_unicode=$invalidText backslash_adjacent_underscore=$escapedUnderscores"
}

function Write-WorkspaceApiKeyDiagnostic([string]$Diagnostic) {
  [Console]::Out.WriteLine("STAGING_QWEN_SECRET_INPUT_DIAGNOSTIC $Diagnostic")
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

function Invoke-ClipboardSecretIngest([string]$RemoteTool, [switch]$ValidateOnly) {
  $clipboard = $null
  $normalized = $null
  $candidate = $null
  try {
    try {
      $clipboard = [string](Get-Clipboard -Raw)
    } catch {
      Write-WorkspaceApiKeyDiagnostic (Get-WorkspaceApiKeyDiagnostic '' '' '')
      throw 'STAGING_QWEN_SECRET_CLIPBOARD_READ_FAILED'
    }
    $normalized = Normalize-ClipboardText $clipboard
    $candidate = Find-UniqueWorkspaceApiKey $normalized
    $diagnostic = Get-WorkspaceApiKeyDiagnostic $clipboard $normalized $candidate
    if ([string]::IsNullOrEmpty($candidate) -or -not (Test-WorkspaceApiKey $candidate)) {
      Write-WorkspaceApiKeyDiagnostic $diagnostic
      throw 'STAGING_QWEN_SECRET_CLIPBOARD_KEY_NOT_UNIQUE'
    }
    try {
      Invoke-SecretIngest -RemoteTool $RemoteTool -ApiKey $candidate -Endpoint (Normalize-CustomizationEndpoint $ConfirmedStagingWorkspaceHost) -ValidateOnly:$ValidateOnly
    } catch {
      if ($_.Exception.Message -match 'KEY_INVALID') { Write-WorkspaceApiKeyDiagnostic $diagnostic }
      throw
    }
  } finally {
    $candidate = $null
    $normalized = $null
    $clipboard = $null
  }
}

if (-not $Library) {
  if ([string]::IsNullOrWhiteSpace($IngestTool)) { throw 'STAGING_QWEN_SECRET_INGEST_TOOL_REQUIRED' }
  Invoke-ClipboardSecretIngest -RemoteTool $IngestTool
  Write-Output 'STAGING_QWEN_SECRET_STORED mode=0600'
}
