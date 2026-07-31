param(
  [string]$InstallerPath = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$EvidenceDir = Join-Path $ProjectRoot "test-results\windows-installer"
$DiagnosticsZip = Join-Path $ProjectRoot "test-results\windows-installer-diagnostics.zip"
$TestRoot = Join-Path $env:RUNNER_TEMP "seo wp sync release qa"
$InstallDir = Join-Path $TestRoot "installed application"
$UserDataRoot = Join-Path $TestRoot "preserved user data"
$InstallerStdout = Join-Path $EvidenceDir "installer.stdout.log"
$InstallerStderr = Join-Path $EvidenceDir "installer.stderr.log"
$UninstallerStdout = Join-Path $EvidenceDir "uninstaller.stdout.log"
$UninstallerStderr = Join-Path $EvidenceDir "uninstaller.stderr.log"
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "独立站 AI.lnk"
$StartMenuShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\独立站 AI.lnk"
$SmokeReport = Join-Path $EvidenceDir "latest.json"
$BackendPort = $null
$VerificationPassed = $false

function Write-JsonEvidence {
  param([string]$Name, [object]$Value)
  $Value | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 (Join-Path $EvidenceDir $Name)
}

function Get-InstalledProcessSnapshot {
  $ResolvedInstallDir = [IO.Path]::GetFullPath($InstallDir)
  @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        ($_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath).StartsWith($ResolvedInstallDir, [StringComparison]::OrdinalIgnoreCase)) -or
        ($_.CommandLine -and $_.CommandLine.IndexOf($ResolvedInstallDir, [StringComparison]::OrdinalIgnoreCase) -ge 0)
      } |
      Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine
  )
}

function Get-ListeningPortSnapshot {
  @(
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Select-Object LocalAddress, LocalPort, OwningProcess, State |
      Sort-Object LocalPort, OwningProcess
  )
}

if (-not $InstallerPath) {
  $Installer = Get-ChildItem (Join-Path $ProjectRoot "release\desktop") -Filter "*.exe" |
    Where-Object { $_.Name -notmatch "(?i)uninstall" } |
    Select-Object -First 1
  if (-not $Installer) { throw "Windows installer was not found in release\desktop." }
  $InstallerPath = $Installer.FullName
}
$InstallerPath = [IO.Path]::GetFullPath($InstallerPath)

if (Test-Path $EvidenceDir) { Remove-Item -Recurse -Force $EvidenceDir }
if (Test-Path $DiagnosticsZip) { Remove-Item -Force $DiagnosticsZip }
if (Test-Path $TestRoot) { Remove-Item -Recurse -Force $TestRoot }
New-Item -ItemType Directory -Force -Path $EvidenceDir, $TestRoot, $UserDataRoot | Out-Null

try {
  $InstallerName = [IO.Path]::GetFileName($InstallerPath)
  if ($InstallerName -cmatch "[^\x00-\x7F]") {
    throw "Windows installer filename must contain ASCII characters only: $InstallerName"
  }

  $LatestYmlPath = Join-Path $ProjectRoot "release\desktop\latest.yml"
  if (-not (Test-Path $LatestYmlPath -PathType Leaf)) { throw "latest.yml was not found." }
  $LatestYml = Get-Content -Raw $LatestYmlPath
  $MetadataPathMatch = [regex]::Match($LatestYml, "(?m)^path:\s*(.+?)\s*$")
  if (-not $MetadataPathMatch.Success) { throw "latest.yml does not declare a release path." }
  $MetadataInstallerName = $MetadataPathMatch.Groups[1].Value.Trim().Trim("'`"")
  if ($MetadataInstallerName -cne $InstallerName) {
    throw "Updater metadata path '$MetadataInstallerName' does not match installer '$InstallerName'."
  }
  $MetadataUrlMatch = [regex]::Match($LatestYml, "(?m)^\s*-\s+url:\s*(.+?)\s*$")
  if (-not $MetadataUrlMatch.Success) { throw "latest.yml does not declare an installer URL." }
  $MetadataUrl = $MetadataUrlMatch.Groups[1].Value.Trim().Trim("'`"")
  if ($MetadataUrl -cne $InstallerName) {
    throw "Updater metadata URL '$MetadataUrl' does not match installer '$InstallerName'."
  }
  $InstallerStream = [IO.File]::OpenRead($InstallerPath)
  try {
    $Sha512 = [Security.Cryptography.SHA512]::Create()
    try {
      $InstallerSha512 = [Convert]::ToBase64String($Sha512.ComputeHash($InstallerStream))
    } finally {
      $Sha512.Dispose()
    }
  } finally {
    $InstallerStream.Dispose()
  }
  $MetadataHashes = @([regex]::Matches($LatestYml, "(?m)^\s*sha512:\s*(.+?)\s*$") | ForEach-Object {
    $_.Groups[1].Value.Trim().Trim("'`"")
  })
  if ($MetadataHashes.Count -eq 0 -or @($MetadataHashes | Where-Object { $_ -cne $InstallerSha512 }).Count -gt 0) {
    throw "Updater metadata SHA-512 does not match the signed installer."
  }
  $BlockmapPath = "$InstallerPath.blockmap"
  if (-not (Test-Path $BlockmapPath -PathType Leaf)) { throw "Installer blockmap was not found: $BlockmapPath" }
  Write-JsonEvidence "release-assets.json" @{
    installer = $InstallerName
    blockmap = [IO.Path]::GetFileName($BlockmapPath)
    updaterMetadata = [IO.Path]::GetFileName($LatestYmlPath)
    metadataPath = $MetadataInstallerName
    metadataUrl = $MetadataUrl
    sha512Matches = $true
    asciiFilename = $true
    consistent = $true
  }

  $Signature = Get-AuthenticodeSignature -FilePath $InstallerPath
  Write-JsonEvidence "authenticode.json" $Signature
  if ($Signature.Status -ne "Valid") {
    throw "Installer Authenticode signature is not valid: $($Signature.Status)."
  }

  Write-JsonEvidence "processes-before.json" (Get-InstalledProcessSnapshot)
  Write-JsonEvidence "ports-before.json" (Get-ListeningPortSnapshot)

  $InstallProcess = Start-Process -FilePath $InstallerPath `
    -ArgumentList @("/S", "/D=$InstallDir") `
    -RedirectStandardOutput $InstallerStdout `
    -RedirectStandardError $InstallerStderr `
    -Wait `
    -PassThru
  if ($InstallProcess.ExitCode -ne 0) { throw "Silent installer exited with code $($InstallProcess.ExitCode)." }
  if (-not (Test-Path $InstallDir -PathType Container)) { throw "Installer did not create the requested path with spaces." }

  $App = Get-ChildItem $InstallDir -File -Filter "*.exe" |
    Where-Object { $_.Name -notmatch "(?i)uninstall" } |
    Sort-Object Length -Descending |
    Select-Object -First 1
  if (-not $App) { throw "Installed application executable was not found under $InstallDir." }
  $InstalledAppSignature = Get-AuthenticodeSignature -FilePath $App.FullName
  Write-JsonEvidence "installed-app-authenticode.json" $InstalledAppSignature
  if ($InstalledAppSignature.Status -ne "Valid") {
    throw "Installed application Authenticode signature is not valid: $($InstalledAppSignature.Status)."
  }
  if (-not (Test-Path $DesktopShortcut) -and -not (Test-Path $StartMenuShortcut)) {
    throw "Installer did not create the configured desktop or Start Menu shortcut."
  }

  & node scripts/packaged-desktop-smoke.mjs `
    --executable $App.FullName `
    --evidence-dir $EvidenceDir `
    --user-data-root $UserDataRoot `
    --real-sidecar
  if ($LASTEXITCODE -ne 0) { throw "Installed application real-sidecar smoke failed with code $LASTEXITCODE." }

  if (-not (Test-Path $SmokeReport -PathType Leaf)) { throw "Packaged smoke report was not written." }
  $Smoke = Get-Content -Raw $SmokeReport | ConvertFrom-Json
  if ($Smoke.result -ne "passed" -or -not $Smoke.gracefulExit) {
    throw "Packaged application did not complete a graceful release smoke exit."
  }
  $BackendUrl = [string]$Smoke.healthAfterRestart.backendUrl
  if ($BackendUrl) { $BackendPort = ([uri]$BackendUrl).Port }

  Start-Sleep -Seconds 2
  $ResidualProcesses = Get-InstalledProcessSnapshot
  Write-JsonEvidence "processes-after-exit.json" $ResidualProcesses
  Write-JsonEvidence "ports-after-exit.json" (Get-ListeningPortSnapshot)
  if ($ResidualProcesses.Count -gt 0) {
    throw "Installed App, backend, or packaged Node process remained after App exit."
  }
  if ($BackendPort) {
    $ResidualBackendPort = @(Get-NetTCPConnection -State Listen -LocalPort $BackendPort -ErrorAction SilentlyContinue)
    if ($ResidualBackendPort.Count -gt 0) {
      throw "Backend port $BackendPort remained listening after App exit."
    }
  }

  $UserDataEntriesBeforeUninstall = @(Get-ChildItem $UserDataRoot -Recurse -Force -ErrorAction SilentlyContinue)
  if ($UserDataEntriesBeforeUninstall.Count -eq 0) {
    throw "The installed App did not create isolated user data for preservation validation."
  }

  $Uninstaller = Get-ChildItem $InstallDir -Recurse -Filter "*.exe" |
    Where-Object { $_.Name -match "(?i)uninstall" } |
    Select-Object -First 1
  if (-not $Uninstaller) { throw "Uninstaller was not found under $InstallDir." }

  $UninstallProcess = Start-Process -FilePath $Uninstaller.FullName `
    -ArgumentList "/S" `
    -RedirectStandardOutput $UninstallerStdout `
    -RedirectStandardError $UninstallerStderr `
    -Wait `
    -PassThru
  if ($UninstallProcess.ExitCode -ne 0) { throw "Silent uninstaller exited with code $($UninstallProcess.ExitCode)." }
  Start-Sleep -Seconds 2

  if (Test-Path $InstallDir) {
    $RemainingProgramFiles = @(Get-ChildItem $InstallDir -Recurse -Force -ErrorAction SilentlyContinue)
    if ($RemainingProgramFiles.Count -gt 0) { throw "Program files remained after silent uninstall." }
  }
  if (Test-Path $DesktopShortcut) { throw "Desktop shortcut remained after silent uninstall." }
  if (Test-Path $StartMenuShortcut) { throw "Start Menu shortcut remained after silent uninstall." }
  if (-not (Test-Path $UserDataRoot -PathType Container)) {
    throw "Silent uninstall removed user data that must be preserved by design."
  }
  Write-JsonEvidence "uninstall-policy.json" @{
    programFilesRemoved = $true
    desktopShortcutRemoved = $true
    startMenuShortcutRemoved = $true
    userDataPreserved = $true
    userDataEntryCount = @(Get-ChildItem $UserDataRoot -Recurse -Force -ErrorAction SilentlyContinue).Count
  }
  $VerificationPassed = $true
  Write-Host "Windows release QA passed: signature, real sidecars, restart, cancellation, exit, and uninstall verified."
} catch {
  Write-JsonEvidence "failure.json" @{
    message = $_.Exception.Message
    type = $_.Exception.GetType().FullName
  }
  throw
} finally {
  Write-JsonEvidence "processes-final.json" (Get-InstalledProcessSnapshot)
  Write-JsonEvidence "ports-final.json" (Get-ListeningPortSnapshot)
  & node scripts/redact-release-evidence.mjs $EvidenceDir
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Evidence redaction failed with exit code $LASTEXITCODE; diagnostics archive will not be created."
  } else {
    Compress-Archive -Path (Join-Path $EvidenceDir "*") -DestinationPath $DiagnosticsZip -Force
  }
  if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
  if ($VerificationPassed -and (Test-Path $TestRoot)) { Remove-Item -Recurse -Force $TestRoot }
}
