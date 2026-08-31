[CmdletBinding()]
param(
  [switch]$PassThru
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-RelayChildPath {
  param(
    [Parameter(Mandatory = $true)][string]$Parent,
    [Parameter(Mandatory = $true)][string]$Candidate,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $candidateFull = [System.IO.Path]::GetFullPath($Candidate)
  $parentPrefix = $parentFull + [System.IO.Path]::DirectorySeparatorChar
  if (-not $candidateFull.StartsWith($parentPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label escaped its intended parent directory."
  }
  return $candidateFull
}

if (-not [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
  [System.Runtime.InteropServices.OSPlatform]::Windows
)) {
  throw 'This helper installs the Windows tunnel-client build only.'
}

$relayArchitecture = switch (
  [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
) {
  'X64' { 'amd64' }
  'Arm64' { 'arm64' }
  default { throw 'tunnel-client publishes Windows builds only for x64 and Arm64.' }
}

$relayRepositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$relayToolRoot = Join-Path $relayRepositoryRoot '.tools\tunnel-client'
[System.IO.Directory]::CreateDirectory($relayToolRoot) | Out-Null
$relayToolRoot = (Resolve-Path -LiteralPath $relayToolRoot).Path

$relayNode = (Get-Command node -ErrorAction Stop).Source
$relayReleaseHelper = Join-Path $PSScriptRoot 'tunnel-client-release.mjs'
$relayMetadataOutput = & $relayNode $relayReleaseHelper resolve
if ($LASTEXITCODE -ne 0) {
  throw 'The tunnel-client release metadata helper failed.'
}
$relayMetadata = ($relayMetadataOutput | Out-String) | ConvertFrom-Json
$relayAssetName = [string]$relayMetadata.assetName
$relayExpectedDigest = [string]$relayMetadata.sha256
$relayReleaseTag = [string]$relayMetadata.tag
if ($relayAssetName -ne "tunnel-client-$relayReleaseTag-windows-$relayArchitecture.zip") {
  throw 'The tunnel-client release metadata did not match the current Windows architecture.'
}

$relayVersionDirectory = Join-Path $relayToolRoot $relayReleaseTag
$relayVersionDirectory = Assert-RelayChildPath `
  -Parent $relayToolRoot `
  -Candidate $relayVersionDirectory `
  -Label 'Version directory'

if (-not (Test-Path -LiteralPath $relayVersionDirectory)) {
  $relayTempParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $relayTempDirectory = Join-Path $relayTempParent ('relay-tunnel-client-' + [guid]::NewGuid().ToString('N'))
  $relayTempDirectory = Assert-RelayChildPath `
    -Parent $relayTempParent `
    -Candidate $relayTempDirectory `
    -Label 'Temporary directory'
  $relayStagingDirectory = Join-Path $relayToolRoot ('.staging-' + [guid]::NewGuid().ToString('N'))
  $relayStagingDirectory = Assert-RelayChildPath `
    -Parent $relayToolRoot `
    -Candidate $relayStagingDirectory `
    -Label 'Staging directory'

  [System.IO.Directory]::CreateDirectory($relayTempDirectory) | Out-Null
  [System.IO.Directory]::CreateDirectory($relayStagingDirectory) | Out-Null
  try {
    $relayArchive = Join-Path $relayTempDirectory $relayAssetName
    $relayDownloadedDigest = & $relayNode `
      $relayReleaseHelper `
      download `
      ([string]$relayMetadata.downloadUrl) `
      $relayArchive `
      ([string]$relayMetadata.size)
    if ($LASTEXITCODE -ne 0) {
      throw 'The tunnel-client release download helper failed.'
    }

    $relayActualDigest = (Get-FileHash -Algorithm SHA256 -LiteralPath $relayArchive).Hash
    if (
      $relayActualDigest -ne $relayExpectedDigest -or
      ([string]$relayDownloadedDigest).Trim() -ne $relayExpectedDigest
    ) {
      throw 'The downloaded tunnel-client archive failed SHA-256 verification.'
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $relayZip = [System.IO.Compression.ZipFile]::OpenRead($relayArchive)
    try {
      $relayStagingPrefix = $relayStagingDirectory.TrimEnd('\') + '\'
      foreach ($relayEntry in $relayZip.Entries) {
        $relayEntryPath = [System.IO.Path]::GetFullPath(
          (Join-Path $relayStagingDirectory $relayEntry.FullName)
        )
        if (-not $relayEntryPath.StartsWith(
          $relayStagingPrefix,
          [System.StringComparison]::OrdinalIgnoreCase
        )) {
          throw 'The tunnel-client archive contained an unsafe path.'
        }
      }
    } finally {
      $relayZip.Dispose()
    }

    Expand-Archive -LiteralPath $relayArchive -DestinationPath $relayStagingDirectory
    $relayExecutables = @(
      Get-ChildItem -LiteralPath $relayStagingDirectory -Filter 'tunnel-client.exe' -File -Recurse
    )
    if ($relayExecutables.Count -ne 1) {
      throw 'The verified tunnel-client archive did not contain exactly one tunnel-client.exe.'
    }

    if (Test-Path -LiteralPath $relayVersionDirectory) {
      throw 'The versioned tunnel-client target appeared while installation was in progress.'
    }
    Move-Item -LiteralPath $relayStagingDirectory -Destination $relayVersionDirectory
  } finally {
    if (Test-Path -LiteralPath $relayTempDirectory) {
      Remove-Item -LiteralPath $relayTempDirectory -Recurse -Force
    }
    if (Test-Path -LiteralPath $relayStagingDirectory) {
      Remove-Item -LiteralPath $relayStagingDirectory -Recurse -Force
    }
  }
}

$relayInstalledExecutables = @(
  Get-ChildItem -LiteralPath $relayVersionDirectory -Filter 'tunnel-client.exe' -File -Recurse
)
if ($relayInstalledExecutables.Count -ne 1) {
  throw 'The versioned tunnel-client directory does not contain exactly one executable.'
}
$relayExecutable = $relayInstalledExecutables[0].FullName
$null = & $relayExecutable help quickstart
if ($LASTEXITCODE -ne 0) {
  throw 'The verified tunnel-client executable failed its quickstart help probe.'
}

Write-Host "Verified $relayAssetName ($relayExpectedDigest)."
if ($PassThru) {
  Write-Output $relayExecutable
} else {
  Write-Host "Installed executable: $relayExecutable"
}
