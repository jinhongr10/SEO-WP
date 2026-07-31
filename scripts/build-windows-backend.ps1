param(
  [string]$Python = "",
  [switch]$SkipPyInstallerCheck
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendEntry = Join-Path $ProjectRoot "backend\desktop_entry.py"
$RuntimeDir = Join-Path $ProjectRoot "desktop\resources\backend"
$BuildDir = Join-Path $ProjectRoot "build\pyinstaller-windows"
$SpecDir = Join-Path $BuildDir "spec"

if (-not $Python) {
  $VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
  if (Test-Path $VenvPython) {
    $Python = $VenvPython
  } else {
    $Python = "python"
  }
}

if (-not (Test-Path $BackendEntry)) {
  throw "Backend desktop entry was not found: $BackendEntry"
}

if (-not $SkipPyInstallerCheck) {
  & $Python -m PyInstaller --version | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller is not available. Install it in the Windows Python environment first: $Python -m pip install pyinstaller"
  }
}

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
New-Item -ItemType Directory -Force -Path $SpecDir | Out-Null

$OldExe = Join-Path $RuntimeDir "seo-wp-sync-backend.exe"
if (Test-Path $OldExe) {
  Remove-Item -Force $OldExe
}

& $Python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --name seo-wp-sync-backend `
  --distpath $RuntimeDir `
  --workpath $BuildDir `
  --specpath $SpecDir `
  --paths $ProjectRoot `
  --collect-submodules backend `
  --collect-data backend `
  --exclude-module backend.tests `
  --exclude-module tests `
  $BackendEntry

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller backend build failed."
}

if (-not (Test-Path $OldExe)) {
  throw "Expected backend executable was not created: $OldExe"
}

Write-Host "Windows backend executable written to $OldExe"
