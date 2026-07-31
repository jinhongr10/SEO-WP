param(
  [string]$Arch = "x64",
  [switch]$SkipBackend,
  [switch]$SkipNodeRuntime,
  [switch]$Release
)

$ErrorActionPreference = "Stop"

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $Command @Arguments
  $ExitCode = $LASTEXITCODE
  if ($ExitCode -ne 0) {
    throw "$Command failed with exit code $ExitCode"
  }
}

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

Push-Location $ProjectRoot
try {
  Invoke-Native npm run build

  if (-not $SkipBackend) {
    $BackendCacheStatus = Invoke-Native node scripts/desktop-build-cache.mjs status backend --platform windows
    if ($env:FORCE_BACKEND -eq "true" -or $BackendCacheStatus -ne "reuse") {
      Invoke-Native powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-backend.ps1
      Invoke-Native node scripts/desktop-build-cache.mjs mark backend --platform windows | Out-Null
    } else {
      Write-Host "Reusing cached Windows backend executable (set FORCE_BACKEND=true to rebuild)."
    }
  }

  if (-not $SkipNodeRuntime) {
    $NodeCacheStatus = Invoke-Native node scripts/desktop-build-cache.mjs status node-runtime --platform windows
    if ($env:FORCE_NODE_RUNTIME -eq "true" -or $NodeCacheStatus -ne "reuse") {
      Invoke-Native powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-windows-node-runtime.ps1
      Invoke-Native node scripts/desktop-build-cache.mjs mark node-runtime --platform windows | Out-Null
    } else {
      Write-Host "Reusing cached Windows Node runtime (set FORCE_NODE_RUNTIME=true to rebuild)."
    }
  }

  $ElectronBuilderArch = "--$Arch"
  $ElectronBuilderConfig = if ($Release) { "electron-builder.release.json" } else { "electron-builder.json" }
  $ElectronBuilderPublish = if ($Release) { "always" } else { "never" }
  Invoke-Native npx electron-builder --win nsis $ElectronBuilderArch --config $ElectronBuilderConfig --publish $ElectronBuilderPublish

  $PackageVersion = Invoke-Native node -p "require('./package.json').version"
  $ExpectedAssets = @(
    "seo-wp-sync-setup-$PackageVersion.exe",
    "seo-wp-sync-setup-$PackageVersion.exe.blockmap",
    "latest.yml"
  )
  foreach ($AssetName in $ExpectedAssets) {
    $AssetPath = Join-Path $ProjectRoot "release\desktop\$AssetName"
    if (-not (Test-Path $AssetPath -PathType Leaf)) {
      throw "Expected Windows release asset was not created: $AssetPath"
    }
  }
} finally {
  Pop-Location
}
