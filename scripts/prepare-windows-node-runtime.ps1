param(
  [string]$NodeExe = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeDir = Join-Path $ProjectRoot "desktop\resources\node-runtime"
$RuntimeNode = Join-Path $RuntimeDir "node.exe"
$RuntimeNodeTemp = Join-Path $RuntimeDir "node.exe.tmp"

if (-not $NodeExe) {
  $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $NodeCommand) {
    throw "node.exe was not found on PATH. Install Node.js on the Windows build machine first."
  }
  $NodeExe = $NodeCommand.Source
}

if (-not (Test-Path $NodeExe)) {
  throw "Node executable was not found: $NodeExe"
}

$NodeIdentity = & $NodeExe -p "process.version + ' ' + process.arch"
if ($LASTEXITCODE -ne 0) {
  throw "Unable to inspect Node runtime: $NodeExe"
}
if ($NodeIdentity -notmatch "^v24\..* x64$") {
  throw "Windows desktop runtime must be Node 24 x64; found $NodeIdentity at $NodeExe"
}

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
Copy-Item -Force $NodeExe $RuntimeNodeTemp
Move-Item -Force $RuntimeNodeTemp $RuntimeNode

Push-Location $ProjectRoot
try {
  & $RuntimeNode scripts/prepare-desktop-node-modules.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Preparing the packaged Node dependency tree failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

Write-Host "Windows Node runtime written to $RuntimeNode"
