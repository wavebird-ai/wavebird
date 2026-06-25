$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

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

$sdkRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = Join-Path $sdkRoot ".tmp\example-artifact-test"
$installRoot = Join-Path $tempRoot "install-root"
$packageNodeSourcePath = Join-Path $sdkRoot "examples\package-node.mjs"
$packageNodeSmokePath = Join-Path $installRoot "package-node.mjs"
$packageBrowserSourcePath = Join-Path $sdkRoot "examples\package-browser.js"
$packageBrowserSmokePath = Join-Path $installRoot "package-browser.mjs"
$callbackSourcePath = Join-Path $sdkRoot "examples\callback-server.mjs"
$callbackSmokePath = Join-Path $installRoot "callback-server.mjs"
$publicContractsSourcePath = Join-Path $sdkRoot "examples\public-contracts.mjs"
$publicContractsSmokePath = Join-Path $installRoot "public-contracts.mjs"
$localNpmCache = Join-Path $tempRoot "npm-cache"
$packageNodeStdoutPath = Join-Path $tempRoot "package-node.stdout.log"
$packageNodeStderrPath = Join-Path $tempRoot "package-node.stderr.log"
$packageBrowserStdoutPath = Join-Path $tempRoot "package-browser.stdout.log"
$packageBrowserStderrPath = Join-Path $tempRoot "package-browser.stderr.log"
$publicContractsStdoutPath = Join-Path $tempRoot "public-contracts.stdout.log"
$publicContractsStderrPath = Join-Path $tempRoot "public-contracts.stderr.log"
$previousNpmCache = $env:npm_config_cache
$previousInternalPack = $env:WAVEBIRD_SDK_INTERNAL_PACK
$previousDryRun = $env:npm_config_dry_run
$previousBaseUrl = $env:WAVEBIRD_BASE_URL
$previousWrapperApiKey = $env:WAVEBIRD_SECRET_KEY
$hadNativeCommandPreference = Test-Path Variable:\PSNativeCommandUseErrorActionPreference
$previousNativeCommandPreference = $null
$mockCslJob = $null
$callbackProcess = $null
$callbackStdoutPath = Join-Path $tempRoot "callback-example.stdout.log"
$callbackStderrPath = Join-Path $tempRoot "callback-example.stderr.log"
$callbackPort = Get-FreeTcpPort
$mockCslPort = Get-FreeTcpPort
$callbackApiKey = "wrapper-dev-key"
$tarballPath = $null

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

if ($hadNativeCommandPreference) {
  $previousNativeCommandPreference = $PSNativeCommandUseErrorActionPreference
}

$PSNativeCommandUseErrorActionPreference = $false

try {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
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

  $packageNodeSource = Get-Content -LiteralPath $packageNodeSourcePath -Raw
  $packageNodeSmokeSource = $packageNodeSource.Replace(
    'console.error("wavebird job creation returned null.");',
    'console.log("wavebird job creation returned null.");'
  )
  $packageBrowserSource = Get-Content -LiteralPath $packageBrowserSourcePath -Raw
  $packageBrowserSmokeSource = $packageBrowserSource.Replace(
    'baseUrl: "http://127.0.0.1:3000"',
    'baseUrl: "http://127.0.0.1:1"'
  ) -replace 'if \(job\?\.slot_ids\[0\]\) \{\r?\n  const decision = await client\.getDecision\(job\.slot_ids\[0\]\);\r?\n  console\.log\(decision\);\r?\n\}',
  "if (job?.slot_ids[0]) {`r`n  const decision = await client.getDecision(job.slot_ids[0]);`r`n  console.log(decision);`r`n} else {`r`n  console.log(""Browser package example createJob returned null."");`r`n}"
  $callbackSmokeSource = Get-Content -LiteralPath $callbackSourcePath -Raw
  $publicContractsSource = Get-Content -LiteralPath $publicContractsSourcePath -Raw

  Set-Content -LiteralPath $packageNodeSmokePath -Value $packageNodeSmokeSource -Encoding UTF8
  Set-Content -LiteralPath $packageBrowserSmokePath -Value $packageBrowserSmokeSource -Encoding UTF8
  Set-Content -LiteralPath $callbackSmokePath -Value $callbackSmokeSource -Encoding UTF8
  Set-Content -LiteralPath $publicContractsSmokePath -Value $publicContractsSource -Encoding UTF8

  Push-Location $installRoot
  try {
    $env:WAVEBIRD_BASE_URL = "http://127.0.0.1:1"
    $env:WAVEBIRD_SECRET_KEY = "wrapper-dev-key"
    $packageNodeRun = Invoke-NodeScriptSmoke -WorkingDirectory $installRoot -ScriptPath $packageNodeSmokePath -StdoutPath $packageNodeStdoutPath -StderrPath $packageNodeStderrPath
    $packageNodeOutput = [string]$packageNodeRun.Stdout
    if ([int]$packageNodeRun.ExitCode -ne 0) {
      throw "package node example failed"
    }
    $packageNodeStderr = Remove-ExpectedSdkWarnings ([string]$packageNodeRun.Stderr)
    if ($packageNodeStderr.Trim().Length -gt 0) {
      throw "package node example wrote unexpected stderr: $packageNodeStderr"
    }
    if ($packageNodeOutput -notmatch "wavebird job creation returned null\.") {
      throw "package node example did not reach the expected fail-silent smoke path"
    }

    $packageBrowserRun = Invoke-NodeScriptSmoke -WorkingDirectory $installRoot -ScriptPath $packageBrowserSmokePath -StdoutPath $packageBrowserStdoutPath -StderrPath $packageBrowserStderrPath
    $packageBrowserOutput = [string]$packageBrowserRun.Stdout
    if ([int]$packageBrowserRun.ExitCode -ne 0) {
      throw "package browser example failed"
    }
    $packageBrowserStderr = Remove-ExpectedSdkWarnings ([string]$packageBrowserRun.Stderr)
    if ($packageBrowserStderr.Trim().Length -gt 0) {
      throw "package browser example wrote unexpected stderr: $packageBrowserStderr"
    }
    if ($packageBrowserOutput -notmatch "Browser package example createJob returned null\.") {
      throw "package browser example did not reach the expected fail-silent smoke path"
    }

    $mockCslJob = Start-Job -ScriptBlock {
      param($Port, $WrapperApiKey)

      $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
      $listener.Start()

      try {
        $client = $listener.AcceptTcpClient()
        try {
          $stream = $client.GetStream()
          try {
            $headerBytes = [System.Collections.Generic.List[byte]]::new()
            $headerTail = ""
            $singleByte = New-Object byte[] 1

            while ($true) {
              $read = $stream.Read($singleByte, 0, 1)
              if ($read -le 0) {
                throw "mock_csl_request_header_incomplete"
              }
              $headerBytes.Add($singleByte[0]) | Out-Null
              $headerTail += [char]$singleByte[0]
              if ($headerTail.Length -gt 4) {
                $headerTail = $headerTail.Substring($headerTail.Length - 4)
              }
              if ($headerTail -eq "`r`n`r`n") {
                break
              }
            }

            $headerText = [System.Text.Encoding]::ASCII.GetString($headerBytes.ToArray())
            $contentLength = 0
            foreach ($line in ($headerText -split "`r`n")) {
              if ($line -match '^Content-Length:\s*(\d+)$') {
                $contentLength = [int]$matches[1]
                break
              }
            }

            $bodyBytes = New-Object byte[] $contentLength
            $totalBodyRead = 0
            while ($totalBodyRead -lt $contentLength) {
              $read = $stream.Read($bodyBytes, $totalBodyRead, $contentLength - $totalBodyRead)
              if ($read -le 0) {
                throw "mock_csl_request_body_incomplete"
              }
              $totalBodyRead += $read
            }
            $requestBody = [System.Text.Encoding]::UTF8.GetString($bodyBytes)

            $responseBody = '{"contract_version":"csl_wrapper_ingress_accepted/v1","job_id":"job-callback-smoke","slot_ids":["slot-callback-smoke"],"status":"accepted","decision_delivery":{"mode":"callback","decision_path_template":null}}'
            $responseBytes = [System.Text.Encoding]::UTF8.GetBytes($responseBody)
            $responseHeaderText = "HTTP/1.1 200 OK`r`nContent-Type: application/json`r`nContent-Length: $($responseBytes.Length)`r`nConnection: close`r`n`r`n"
            $responseHeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($responseHeaderText)
            $stream.Write($responseHeaderBytes, 0, $responseHeaderBytes.Length)
            $stream.Write($responseBytes, 0, $responseBytes.Length)
            $stream.Flush()
          } finally {
            $stream.Dispose()
          }
        } finally {
          $client.Dispose()
        }

        $requestJson = $requestBody | ConvertFrom-Json
        $callbackUrl = $null
        if ($requestJson.PSObject.Properties.Name -contains "callback_url") {
          $callbackUrl = [string]$requestJson.callback_url
        } elseif ($requestJson.PSObject.Properties.Name -contains "delivery" -and $null -ne $requestJson.delivery) {
          $callbackUrl = [string]$requestJson.delivery.callback_url
        }
        if ([string]::IsNullOrWhiteSpace($callbackUrl)) {
          throw "callback_url_missing"
        }

        $callbackPayload = '{"slot_id":"slot-callback-smoke","fill":true,"creative":{"url":"https://cdn.example/callback-smoke.png"}}'
        $hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($WrapperApiKey))
        try {
          $hashBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($callbackPayload))
        } finally {
          $hmac.Dispose()
        }
        $hashHex = ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
        $signature = "sha256=$hashHex"

        $callbackRequest = [System.Net.HttpWebRequest]::Create($callbackUrl)
        $callbackRequest.Method = "POST"
        $callbackRequest.ContentType = "application/json"
        $callbackRequest.Headers.Add("x-csl-signature", $signature)
        $callbackBytes = [System.Text.Encoding]::UTF8.GetBytes($callbackPayload)
        $callbackRequest.ContentLength = $callbackBytes.Length

        $requestStream = $callbackRequest.GetRequestStream()
        try {
          $requestStream.Write($callbackBytes, 0, $callbackBytes.Length)
        } finally {
          $requestStream.Dispose()
        }

        $callbackResponse = $callbackRequest.GetResponse()
        try {
          if ([int]$callbackResponse.StatusCode -ne 200) {
            throw "callback_delivery_failed_status_$([int]$callbackResponse.StatusCode)"
          }
        } finally {
          $callbackResponse.Dispose()
        }
      } finally {
        $listener.Stop()
      }
    } -ArgumentList $mockCslPort, $callbackApiKey

    $env:WAVEBIRD_BASE_URL = "http://127.0.0.1:$mockCslPort"
    $env:WAVEBIRD_SECRET_KEY = $callbackApiKey
    $env:WAVEBIRD_CALLBACK_PORT = [string]$callbackPort

    $callbackProcess = Start-Process -FilePath "node" -ArgumentList $callbackSmokePath -WorkingDirectory $installRoot -RedirectStandardOutput $callbackStdoutPath -RedirectStandardError $callbackStderrPath -PassThru

    $callbackJobMarker = "Created callback job: {""job_id"":""job-callback-smoke"""
    $callbackValidMarker = "Callback valid=true"
    $callbackDeadline = [DateTime]::UtcNow.AddSeconds(10)

    do {
      Start-Sleep -Milliseconds 200
      $callbackStdout = Get-FileTextOrEmpty -Path $callbackStdoutPath
      $callbackStderr = Remove-ExpectedSdkWarnings (Get-FileTextOrEmpty -Path $callbackStderrPath)

      if ($callbackStdout.Contains($callbackJobMarker) -and $callbackStdout.Contains($callbackValidMarker)) {
        break
      }

      if ($callbackProcess.HasExited) {
        throw "callback example exited early. stdout: $callbackStdout stderr: $callbackStderr"
      }
    } while ([DateTime]::UtcNow -lt $callbackDeadline)

    $callbackStdout = Get-FileTextOrEmpty -Path $callbackStdoutPath
    $callbackStderr = Remove-ExpectedSdkWarnings (Get-FileTextOrEmpty -Path $callbackStderrPath)

    if (-not $callbackStdout.Contains($callbackJobMarker)) {
      throw "callback example missing job creation marker. stdout: $callbackStdout stderr: $callbackStderr"
    }
    if (-not $callbackStdout.Contains($callbackValidMarker)) {
      throw "callback example missing signed callback marker. stdout: $callbackStdout stderr: $callbackStderr"
    }
    if ($callbackStderr.Trim().Length -gt 0) {
      throw "callback example wrote stderr: $callbackStderr"
    }

    $publicContractsRun = Invoke-NodeScriptSmoke -WorkingDirectory $installRoot -ScriptPath $publicContractsSmokePath -StdoutPath $publicContractsStdoutPath -StderrPath $publicContractsStderrPath
    $publicContractsOutput = [string]$publicContractsRun.Stdout
    if ([int]$publicContractsRun.ExitCode -ne 0) {
      throw "public contracts example failed"
    }
    $publicContractsStderr = Remove-ExpectedSdkWarnings ([string]$publicContractsRun.Stderr)
    if ($publicContractsStderr.Trim().Length -gt 0) {
      throw "public contracts example wrote unexpected stderr: $publicContractsStderr"
    }
    if ($publicContractsOutput -notmatch "public contract example ok") {
      throw "public contracts example missing success marker"
    }
    if ($publicContractsOutput -notmatch "csl_wrapper_ingress_create/v1") {
      throw "public contracts example missing expected contract version"
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

  if ($null -eq $previousBaseUrl) {
    Remove-Item Env:\WAVEBIRD_BASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:WAVEBIRD_BASE_URL = $previousBaseUrl
  }

  if ($null -eq $previousWrapperApiKey) {
    Remove-Item Env:\WAVEBIRD_SECRET_KEY -ErrorAction SilentlyContinue
  } else {
    $env:WAVEBIRD_SECRET_KEY = $previousWrapperApiKey
  }

  if ($hadNativeCommandPreference) {
    $PSNativeCommandUseErrorActionPreference = $previousNativeCommandPreference
  } else {
    Remove-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
  }

  Remove-Item Env:\WAVEBIRD_CALLBACK_PORT -ErrorAction SilentlyContinue

  if ($callbackProcess -and -not $callbackProcess.HasExited) {
    Stop-Process -Id $callbackProcess.Id -Force -ErrorAction SilentlyContinue
  }

  if ($mockCslJob) {
    if ($mockCslJob.State -eq "Running") {
      Stop-Job -Job $mockCslJob -ErrorAction SilentlyContinue
      Remove-Job -Job $mockCslJob -Force -ErrorAction SilentlyContinue
    } else {
      Receive-Job -Job $mockCslJob -Wait | Out-Null
      Remove-Job -Job $mockCslJob -Force -ErrorAction SilentlyContinue
    }
  }

  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "sdk/example-smoke.ps1 ok"
