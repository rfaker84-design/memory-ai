[CmdletBinding()]
param(
  [ValidatePattern('^/home/ubuntu/memoryai-staging/tools/qwen-e2e-[0-9a-f]{40}/staging-qwen-secret-ingest\.cjs$')]
  [string]$RemoteTool
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. "$PSScriptRoot\enter-staging-qwen-secrets.ps1" -Library

$fakeKey = 'sk-ws-fictional.alpha\_beta-1234567890'
$fakeHost = 'fake-workspace.cn-beijing.maas.aliyuncs.com'
$clipboardFixture = "api $fakeKey API Host $fakeHost"
$normalized = Normalize-ClipboardText $clipboardFixture
$candidate = Find-UniqueWorkspaceApiKey $normalized

if ($candidate -ne 'sk-ws-fictional.alpha_beta-1234567890') { throw 'STAGING_QWEN_SECRET_CLIPBOARD_FIXTURE_EXTRACT_FAILED' }
if (-not (Test-WorkspaceApiKey $candidate)) { throw 'STAGING_QWEN_SECRET_CLIPBOARD_FIXTURE_VALIDATION_FAILED' }
if ((Normalize-CustomizationEndpoint $fakeHost) -ne "https://$fakeHost/api/v1/services/audio/tts/customization") { throw 'STAGING_QWEN_SECRET_ENDPOINT_NORMALIZATION_FAILED' }

$diagnostic = Get-WorkspaceApiKeyDiagnostic $clipboardFixture $normalized $candidate
if ($diagnostic -notmatch '^length=') { throw 'STAGING_QWEN_SECRET_DIAGNOSTIC_LENGTH_MISSING' }
if ($diagnostic -notmatch 'starts_with_sk_ws=true') { throw 'STAGING_QWEN_SECRET_DIAGNOSTIC_PREFIX_MISSING' }
if ($diagnostic -notmatch 'backslash_adjacent_underscore=1') { throw 'STAGING_QWEN_SECRET_DIAGNOSTIC_ESCAPE_MISSING' }
if ($diagnostic -match [regex]::Escape($fakeKey)) { throw 'STAGING_QWEN_SECRET_DIAGNOSTIC_LEAKED_FIXTURE' }

$secondKey = 'sk-ws-fictional.gamma_delta-1234567890'
$multipleFixture = "$clipboardFixture`n$secondKey"
$normalizedMultipleFixture = Normalize-ClipboardText $multipleFixture
$multipleMatches = [regex]::Matches($normalizedMultipleFixture, $WorkspaceApiKeyCandidatePattern)
if ($multipleMatches.Count -ne 2) { throw "STAGING_QWEN_SECRET_MULTI_MATCH_FIXTURE_INVALID_$($multipleMatches.Count)" }
$multipleCandidate = Find-UniqueWorkspaceApiKey $normalizedMultipleFixture
if (-not [string]::IsNullOrEmpty($multipleCandidate)) { throw 'STAGING_QWEN_SECRET_MULTI_MATCH_NOT_REJECTED' }
$zeroCandidate = Find-UniqueWorkspaceApiKey 'api no workspace key here'
if (-not [string]::IsNullOrEmpty($zeroCandidate)) { throw 'STAGING_QWEN_SECRET_ZERO_MATCH_NOT_REJECTED' }

Write-Output 'STAGING_QWEN_SECRET_CLIPBOARD_NORMALIZATION_TEST=PASS'
if (-not [string]::IsNullOrEmpty($RemoteTool)) {
  Invoke-SecretIngest -RemoteTool $RemoteTool -ApiKey $candidate -Endpoint (Normalize-CustomizationEndpoint $fakeHost) -ValidateOnly
  Write-Output 'STAGING_QWEN_SECRET_INPUT_CHAIN_TEST=PASS mode=validate-only'
}
