$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$sdkRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = Join-Path $sdkRoot ".tmp\package-artifact-test"
$installRoot = Join-Path $tempRoot "install-root"
$verifyScriptPath = Join-Path $installRoot "verify-sdk-artifact.mjs"
$verifyStdoutPath = Join-Path $tempRoot "verify-sdk-artifact.stdout.log"
$verifyStderrPath = Join-Path $tempRoot "verify-sdk-artifact.stderr.log"
$indexJsPath = Join-Path $sdkRoot "dist\sdk\src\index.js"
$publicContractsPath = Join-Path $sdkRoot "dist\sdk\src\public_contracts\index.js"
$localNpmCache = Join-Path $tempRoot "npm-cache"
$previousNpmCache = $env:npm_config_cache
$previousInternalPack = $env:WAVEBIRD_SDK_INTERNAL_PACK
$previousDryRun = $env:npm_config_dry_run
$tarballPath = $null

function Get-FileTextOrEmpty {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return ""
  }

  $content = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue
  if ($null -eq $content) {
    return ""
  }

  return [string]$content
}

function Remove-ExpectedSdkWarnings {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  $expectedWarnings = @(
    "wavebird is now an advanced compatibility layer."
    "mountWavebirdAd is deprecated."
    "resolveAdTimingPlan is deprecated."
  )

  $filteredLines = $Text -split "`r?`n" | Where-Object {
    $line = $_
    -not ($expectedWarnings | Where-Object { $line -match [regex]::Escape($_) })
  }

  return (($filteredLines | Where-Object { $_ -ne $null }) -join "`n")
}

function Invoke-NodeScriptSmoke {
  param(
    [string]$WorkingDirectory,
    [string]$ScriptPath,
    [string]$StdoutPath,
    [string]$StderrPath
  )

  Remove-Item -LiteralPath $StdoutPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $StderrPath -Force -ErrorAction SilentlyContinue

  $process = Start-Process -FilePath "node" -ArgumentList $ScriptPath -WorkingDirectory $WorkingDirectory -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath -Wait -PassThru

  return @{
    ExitCode = $process.ExitCode
    Stdout = Get-FileTextOrEmpty -Path $StdoutPath
    Stderr = Get-FileTextOrEmpty -Path $StderrPath
  }
}

function Resolve-TarballPath {
  param(
    [string]$SdkRoot,
    [string]$TempRoot,
    [string]$TarballFilename
  )

  $candidates = @(
    (Join-Path $TempRoot $TarballFilename),
    (Join-Path $SdkRoot $TarballFilename)
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  $matches = @(
    Get-ChildItem -LiteralPath $TempRoot -Filter $TarballFilename -Recurse -File -ErrorAction SilentlyContinue
    Get-ChildItem -LiteralPath $SdkRoot -Filter $TarballFilename -File -ErrorAction SilentlyContinue
  ) | Where-Object { $_ } | Select-Object -First 1

  if ($matches) {
    return $matches.FullName
  }

  return $null
}

try {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $localNpmCache -Force | Out-Null
  $env:npm_config_cache = $localNpmCache
  $env:WAVEBIRD_SDK_INTERNAL_PACK = "1"
  $env:npm_config_dry_run = "false"

  Push-Location $sdkRoot
  try {
    & node (Join-Path $sdkRoot "scripts\build.mjs")
    if ($LASTEXITCODE -ne 0) {
      throw "sdk build failed"
    }

    $packJson = & npm pack --json --pack-destination $tempRoot
    if ($LASTEXITCODE -ne 0) {
      throw "npm pack failed"
    }
  } finally {
    Pop-Location
  }
  $packed = $packJson | ConvertFrom-Json
  if ($packed.Count -ne 1) {
    throw "unexpected npm pack result count: $($packed.Count)"
  }
  $tarballFilename = [string]$packed[0].filename
  if ([string]::IsNullOrWhiteSpace($tarballFilename)) {
    throw "npm pack did not return a tarball filename"
  }
  $tarballPath = Resolve-TarballPath -SdkRoot $sdkRoot -TempRoot $tempRoot -TarballFilename $tarballFilename
  if ([string]::IsNullOrWhiteSpace($tarballPath)) {
    throw "packed tarball not found for $tarballFilename"
  }

  $indexJs = Get-Content -LiteralPath $indexJsPath -Raw
  if ($indexJs -notmatch 'from "\./wavebird-client\.js"') {
    throw "sdk dist index.js does not point at the packaged client entry"
  }
  $publicContractsJs = Get-Content -LiteralPath $publicContractsPath -Raw
  if ($publicContractsJs -notmatch 'from "\./wrapper\.js"') {
    throw "sdk dist public contracts index.js does not point at packaged contract files"
  }

  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
  Push-Location $installRoot
  try {
    & npm init -y | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "npm init failed"
    }
    & npm install $tarballPath | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "npm install tarball failed"
    }
  } finally {
    Pop-Location
  }

  $reactRoot = Join-Path $installRoot "node_modules\react"
  $reactDomRoot = Join-Path $installRoot "node_modules\react-dom"
  New-Item -ItemType Directory -Path $reactRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $reactDomRoot -Force | Out-Null
  @'
{
  "name": "react",
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./jsx-runtime": "./jsx-runtime.js"
  }
}
'@ | Set-Content -LiteralPath (Join-Path $reactRoot "package.json") -Encoding UTF8
  @'
export function useEffect() {}
export function useMemo(factory) {
  return factory();
}
export function useState(initialValue) {
  const value = typeof initialValue === "function" ? initialValue() : initialValue;
  return [value, () => {}];
}
export function useRef(initialValue = null) {
  return { current: initialValue };
}
'@ | Set-Content -LiteralPath (Join-Path $reactRoot "index.js") -Encoding UTF8
  @'
export const Fragment = Symbol.for("react.fragment");
export function jsx(type, props) {
  return { type, props };
}
export const jsxs = jsx;
'@ | Set-Content -LiteralPath (Join-Path $reactRoot "jsx-runtime.js") -Encoding UTF8
  @'
{
  "name": "react-dom",
  "type": "module",
  "exports": {
    ".": "./index.js"
  }
}
'@ | Set-Content -LiteralPath (Join-Path $reactDomRoot "package.json") -Encoding UTF8
  'export {}' | Set-Content -LiteralPath (Join-Path $reactDomRoot "index.js") -Encoding UTF8

  @'
import assert from "node:assert/strict";
import { WavebirdClient, WavebirdSdkError, WavebirdSdkErrorCode } from "wavebird";
import { WavebirdClient as BrowserClient, WavebirdSdkError as BrowserWavebirdSdkError } from "wavebird/browser";
import { WavebirdAd } from "wavebird/react";
import { mountWavebirdAd } from "wavebird/mount";
import { WRAPPER_INGRESS_CREATE_CONTRACT_VERSION, isCslWrapperIngressCreateRequestV1 } from "wavebird/public-contracts";

assert.equal(typeof WavebirdClient, "function");
assert.equal(typeof BrowserClient, "function");
assert.equal(typeof WavebirdAd, "function");
assert.equal(typeof mountWavebirdAd, "function");
assert.equal(typeof WavebirdSdkError, "function");
assert.equal(typeof BrowserWavebirdSdkError, "function");
assert.equal(WavebirdSdkErrorCode.DECISION_TIMEOUT, "sdk_decision_timeout");
assert.equal(WRAPPER_INGRESS_CREATE_CONTRACT_VERSION, "csl_wrapper_ingress_create/v1");
assert.equal(typeof isCslWrapperIngressCreateRequestV1, "function");
console.log("sdk package import smoke ok");
'@ | Set-Content -LiteralPath $verifyScriptPath -Encoding UTF8

  Push-Location $installRoot
  try {
    $verifyRun = Invoke-NodeScriptSmoke -WorkingDirectory $installRoot -ScriptPath $verifyScriptPath -StdoutPath $verifyStdoutPath -StderrPath $verifyStderrPath
    $verifyOutput = [string]$verifyRun.Stdout
    if ([int]$verifyRun.ExitCode -ne 0) {
      throw "node import verification failed"
    }
    $verifyStderr = Remove-ExpectedSdkWarnings ([string]$verifyRun.Stderr)
    if ([string]::IsNullOrWhiteSpace($verifyStderr) -eq $false) {
      throw "node import verification wrote unexpected stderr: $verifyStderr"
    }
    if ($verifyOutput -notmatch "sdk package import smoke ok") {
      throw "missing import verification success marker"
    }
  } finally {
    Pop-Location
  }
} finally {
  if ($null -eq $previousNpmCache) {
    Remove-Item Env:\npm_config_cache -ErrorAction SilentlyContinue
  } else {
    $env:npm_config_cache = $previousNpmCache
  }

  if ($null -eq $previousInternalPack) {
    Remove-Item Env:\WAVEBIRD_SDK_INTERNAL_PACK -ErrorAction SilentlyContinue
  } else {
    $env:WAVEBIRD_SDK_INTERNAL_PACK = $previousInternalPack
  }

  if ($null -eq $previousDryRun) {
    Remove-Item Env:\npm_config_dry_run -ErrorAction SilentlyContinue
  } else {
    $env:npm_config_dry_run = $previousDryRun
  }

  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "sdk/package-smoke.ps1 ok"
