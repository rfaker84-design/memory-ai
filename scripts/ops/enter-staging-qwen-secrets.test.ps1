[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^/home/ubuntu/memoryai-staging/tools/qwen-e2e-[0-9a-f]{40}/staging-qwen-secret-ingest\.cjs$')]
  [string]$RemoteTool
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'enter-staging-qwen-secrets.ps1') -Library

$raw = " `t$([char]0xFEFF)`"api sk-ws-fictional.alpha\_beta-123`" `r`n"
$normalized = Normalize-WorkspaceApiKey $raw
if ($normalized -cne 'sk-ws-fictional.alpha_beta-123') { throw 'STAGING_QWEN_SECRET_TEST_NORMALIZATION_FAILED' }
if (-not (Test-WorkspaceApiKey $normalized)) { throw 'STAGING_QWEN_SECRET_TEST_PATTERN_FAILED' }
$diagnostic = Get-WorkspaceApiKeyDiagnostic $raw $normalized
foreach ($field in @('length=', 'starts_with_sk_ws=true', 'leading_whitespace=', 'trailing_whitespace=', 'bom=1', 'nul=0', 'control=', 'invalid_unicode=none', 'backslash_adjacent_underscore=1')) {
  if (-not $diagnostic.Contains($field, [System.StringComparison]::Ordinal)) { throw 'STAGING_QWEN_SECRET_TEST_DIAGNOSTIC_FAILED' }
}
Invoke-SecretIngest -RemoteTool $RemoteTool -ApiKey $normalized -Endpoint (Normalize-CustomizationEndpoint 'workspace-1') -ValidateOnly
Write-Output 'STAGING_QWEN_SECRET_INPUT_CHAIN_TEST=PASS mode=validate-only'
