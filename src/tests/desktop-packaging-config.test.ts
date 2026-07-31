import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';

test('package.json exposes desktop build scripts', async () => {
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'));

  assert.equal(pkg.name, 'seo-wp-sync');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[''].version);
  assert.equal(pkg.main, 'desktop/main.cjs');
  assert.equal(pkg.scripts.dev, 'node scripts/dev-all.cjs');
  assert.equal(pkg.scripts['dev:frontend'], 'vite');
  assert.equal(pkg.scripts['dev:all'], 'node scripts/dev-all.cjs');
  assert.equal(pkg.scripts['desktop:dev'], 'node desktop/dev-runner.cjs');
  assert.equal(pkg.scripts['build:desktop'], 'bash scripts/build-macos-desktop.sh');
  assert.equal(pkg.scripts['build:desktop:mac'], 'bash scripts/build-macos-desktop.sh');
  assert.equal(
    pkg.scripts['build:desktop:mac:release'],
    'PUBLISH=always ELECTRON_BUILDER_CONFIG=electron-builder.release.json bash scripts/build-macos-desktop.sh',
  );
  assert.equal(pkg.scripts['build:desktop:backend:mac'], 'bash scripts/build-macos-backend.sh');
  assert.equal(pkg.scripts['prepare:desktop:node-runtime'], 'bash scripts/prepare-macos-node-runtime.sh');
  assert.equal(pkg.scripts['build:desktop:mac:arm64'], 'electron-builder --mac dmg zip --arm64 --publish never');
  assert.equal(
    pkg.scripts['build:desktop:windows'],
    'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-desktop.ps1',
  );
  assert.equal(
    pkg.scripts['build:desktop:windows:release'],
    'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-desktop.ps1 -Release',
  );
  assert.equal(
    pkg.scripts['build:desktop:backend:windows'],
    'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-backend.ps1',
  );
  assert.equal(
    pkg.scripts['prepare:desktop:node-runtime:windows'],
    'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-windows-node-runtime.ps1',
  );
  assert.equal(pkg.scripts['build:desktop:windows:x64'], 'electron-builder --win nsis --x64');
  assert.match(pkg.dependencies['electron-updater'], /^\^6\./);
});

test('electron-builder config keeps secrets and runtime state out of app resources', async () => {
  const config = JSON.parse(await readFile(new URL('../../electron-builder.json', import.meta.url), 'utf8'));
  const files = config.files.join('\n');
  const extraResources = config.extraResources.map((entry: { from: string }) => entry.from);

  assert.equal(config.npmRebuild, false);
  assert.equal(config.electronDist, 'node_modules/electron/dist');
  assert.equal(config.publish, undefined);
  assert.ok(config.extraResources.some((entry: { from: string; to: string }) => (
    entry.from === 'desktop/resources' && entry.to === '.'
  )));
  const desktopResources = config.extraResources.find((entry: { from: string }) => entry.from === 'desktop/resources');
  assert.ok(desktopResources.filter.includes('!**/*.db'));
  assert.ok(desktopResources.filter.includes('!**/*.db-wal'));

  for (const forbidden of ['.env', '.env.local', '.env.server', 'keys', 'data', 'state', 'backup', 'cache']) {
    assert.match(files, new RegExp(`!${forbidden.replace('.', '\\.')}`));
    assert.doesNotMatch(extraResources.join('\n'), new RegExp(`^${forbidden}$`, 'm'));
  }

  assert.equal(config.win.requestedExecutionLevel, 'asInvoker');
  assert.equal(config.artifactName, 'seo-wp-sync-setup-${version}.${ext}');
  assert.equal(config.win.verifyUpdateCodeSignature, true);
  assert.equal(config.win.target[0].target, 'nsis');
  assert.deepEqual(config.win.target[0].arch, ['x64']);
  assert.equal(config.mac.icon, 'build/icon.icns');
  assert.equal(config.mac.category, 'public.app-category.productivity');
  assert.equal(config.mac.hardenedRuntime, false);
  assert.equal(config.mac.identity, null);
  assert.deepEqual(config.mac.target.map((target: { target: string }) => target.target), ['dmg', 'zip']);
  assert.equal(config.dmg.artifactName, '${productName}-${version}-${arch}.${ext}');
  assert.ok(config.dmg.contents.some((entry: { type?: string; path?: string }) => (
    entry.type === 'link' && entry.path === '/Applications'
  )));
  assert.equal(config.nsis.oneClick, false);
  assert.equal(config.nsis.createDesktopShortcut, true);
  assert.equal(config.nsis.createStartMenuShortcut, true);
});

test('packaged updater config points local desktop builds at the GitHub release repo', async () => {
  const updaterConfig = await readFile(new URL('../../desktop/resources/app-update.yml', import.meta.url), 'utf8');

  assert.match(updaterConfig, /provider:\s*github/);
  assert.match(updaterConfig, /owner:\s*jinhongr10/);
  assert.match(updaterConfig, /repo:\s*SEO-WP/);
  assert.match(updaterConfig, /private:\s*false/);
  assert.match(updaterConfig, /updaterCacheDirName:\s*seo-wp-sync-updater/);
});

test('release-only updater config publishes installers to public GitHub releases repository', async () => {
  const config = JSON.parse(await readFile(new URL('../../electron-builder.release.json', import.meta.url), 'utf8'));

  assert.equal(config.extends, './electron-builder.json');
  assert.deepEqual(config.publish, [{
    provider: 'github',
    owner: 'jinhongr10',
    repo: 'SEO-WP',
    private: false,
    releaseType: 'draft',
    vPrefixedTagName: true,
  }]);
});

test('GitHub tag workflow publishes Windows update artifacts to the release repository', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/windows-desktop-build.yml', import.meta.url), 'utf8');

  assert.match(workflow, /push:[\s\S]*tags:[\s\S]*"v\*"/);
  assert.match(workflow, /windows-release-gate:/);
  assert.match(workflow, /Rebuild Renderer, Python backend, Node runtime, production modules, and NSIS installer[\s\S]*!startsWith\(github\.ref, 'refs\/tags\/v'\)[\s\S]*npm run build:desktop:windows/);
  assert.match(workflow, /GH_TOKEN:\s*\$\{\{\s*secrets\.GH_TOKEN\s*\|\|\s*secrets\.SEOWP\s*\}\}/);
  assert.match(workflow, /CSC_LINK:\s*\$\{\{\s*secrets\.WINDOWS_CSC_LINK\s*\}\}/);
  assert.match(workflow, /CSC_KEY_PASSWORD:\s*\$\{\{\s*secrets\.WINDOWS_CSC_KEY_PASSWORD\s*\}\}/);
  assert.match(workflow, /npm run build:desktop:windows:release/);
  assert.match(workflow, /test-windows-installer\.ps1/);
  assert.match(workflow, /windows-installer-diagnostics\.zip/);
  assert.doesNotMatch(workflow, /npm run build:desktop\s*(\r?\n|$)/);
  assert.doesNotMatch(workflow, /cache:\s*npm/);
});

test('Windows installer QA verifies signed assets, real sidecars, cleanup, and user-data policy', async () => {
  const script = await readFile(new URL('../../scripts/test-windows-installer.ps1', import.meta.url), 'utf8');

  assert.match(script, /Get-ChildItem \$InstallDir -File -Filter "\*\.exe"/);
  assert.doesNotMatch(script, /-Filter "独立站 AI\.exe"/);
  assert.match(script, /Get-AuthenticodeSignature/);
  assert.match(script, /\$Signature\.Status -ne "Valid"/);
  assert.match(script, /Updater metadata SHA-512 does not match the signed installer/);
  assert.match(script, /--real-sidecar/);
  assert.match(script, /--user-data-root/);
  assert.match(script, /processes-after-exit\.json/);
  assert.match(script, /ports-after-exit\.json/);
  assert.match(script, /userDataPreserved = \$true/);
  assert.match(script, /redact-release-evidence\.mjs/);
});

test('packaged import templates use generic placeholders instead of local customer data', async () => {
  const templateDir = new URL('../../import_templates/', import.meta.url);
  const names = await readdir(templateDir);
  const csvNames = names.filter(name => name.endsWith('.csv'));
  const combined = (await Promise.all(csvNames.map(name => (
    readFile(new URL(name, templateDir), 'utf8')
  )))).join('\n');

  assert.doesNotMatch(combined, /example-site\.com/i);
  assert.doesNotMatch(combined, /Demo Brand/);
  assert.doesNotMatch(combined, /shenzhendemo-brand@gmail\.com/i);
  assert.doesNotMatch(combined, /Your Brand/);
  assert.match(combined, /MODEL-001 Product Name/);
  assert.match(combined, /example\.com/);
});

test('Electron main enables packaged auto updater without running it in development', async () => {
  const source = await readFile(new URL('../../desktop/main.cjs', import.meta.url), 'utf8');

  assert.match(source, /loadAutoUpdater/);
  assert.match(source, /configureAutoUpdater/);
  assert.match(source, /UPDATE_RELEASE_OWNER = 'jinhongr10'/);
  assert.match(source, /UPDATE_RELEASE_REPO = 'SEO-WP'/);
  assert.match(source, /setFeedURL\(UPDATE_FEED_CONFIG\)/);
  assert.match(source, /getUserFacingUpdateError/);
  assert.match(source, /app-update\.yml/);
  assert.match(source, /isUpdatePlatformSupported/);
  assert.match(source, /isPackaged\(\) && \(process\.platform === 'darwin' \|\| process\.platform === 'win32'\)/);
  assert.match(source, /checkForUpdates\(\)/);
  assert.match(source, /desktop\.updates\.getStatus/);
  assert.match(source, /desktop\.updates\.check/);
  assert.match(source, /desktop\.updates\.install/);
  assert.match(source, /desktop\.updates\.status/);
  assert.match(source, /download-progress/);
  assert.match(source, /update-downloaded/);
  assert.match(source, /quitAndInstall/);
  assert.match(source, /app\.whenReady\(\)[\s\S]*configureAutoUpdater/);
});

test('Electron production renderer uses a stable custom origin and blocks untrusted navigation', async () => {
  const source = await readFile(new URL('../../desktop/main.cjs', import.meta.url), 'utf8');

  assert.match(source, /const APP_ORIGIN = `\$\{APP_SCHEME\}:\/\/\$\{APP_HOST\}`/);
  assert.match(source, /protocol\.registerSchemesAsPrivileged/);
  assert.match(source, /await protocol\.handle\(APP_SCHEME/);
  assert.match(source, /rendererUrl = APP_ORIGIN/);
  assert.match(source, /migrateLegacyLocalStorage/);
  assert.match(source, /setWindowOpenHandler/);
  assert.match(source, /will-navigate/);
  assert.match(source, /target\.protocol === 'https:'/);
});

test('Electron production backend uses the shared process supervisor and never falls back to Python when packaged', async () => {
  const source = await readFile(new URL('../../desktop/main.cjs', import.meta.url), 'utf8');

  assert.match(source, /spawnWithLog/);
  assert.match(source, /await terminateProcessTree\(child\)/);
  assert.match(source, /if \(isPackaged\(\)\) \{\s*throw new Error\(/);
  assert.doesNotMatch(source, /if \(isPackaged\(\) && fs\.existsSync\(packagedBackend\)\)/);
});

test('Electron preload exposes desktop updater controls to the renderer', async () => {
  const source = await readFile(new URL('../../desktop/preload.cjs', import.meta.url), 'utf8');

  assert.match(source, /getUpdateStatus:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('desktop\.updates\.getStatus'\)/);
  assert.match(source, /checkForUpdates:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('desktop\.updates\.check'\)/);
  assert.match(source, /installUpdate:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('desktop\.updates\.install'\)/);
  assert.match(source, /onUpdateStatus/);
  assert.match(source, /desktop\.updates\.status/);
});

test('macOS packaging uses a custom app icon source', async () => {
  const svg = await readFile(new URL('../../build/icon.svg', import.meta.url), 'utf8');
  const icon = await stat(new URL('../../build/icon.icns', import.meta.url));

  assert.match(svg, /aria-label="独立站 AI"/);
  assert.ok(icon.size > 1024);
});

test('macOS backend build creates a directly runnable onedir bundle', async () => {
  const script = await readFile(new URL('../../scripts/build-macos-backend.sh', import.meta.url), 'utf8');

  assert.match(script, /--onedir/);
  assert.match(script, /desktop\/resources\/backend/);
  assert.match(script, /seo-wp-sync-backend/);
  assert.match(script, /PYINSTALLER_CONFIG_DIR/);
  assert.doesNotMatch(script, /--onefile/);
});

test('macOS Node runtime prep copies node into desktop resources', async () => {
  const script = await readFile(new URL('../../scripts/prepare-macos-node-runtime.sh', import.meta.url), 'utf8');

  assert.match(script, /desktop\/resources\/node-runtime\/bin/);
  assert.match(script, /process\.execPath/);
  assert.match(script, /chmod 755/);
  assert.match(script, /prepare-desktop-node-modules\.mjs/);
});

test('Windows backend build creates the single executable expected by Electron', async () => {
  const script = await readFile(new URL('../../scripts/build-windows-backend.ps1', import.meta.url), 'utf8');

  assert.match(script, /--onefile/);
  assert.match(script, /desktop\\resources\\backend/);
  assert.match(script, /seo-wp-sync-backend\.exe/);
  assert.doesNotMatch(script, /--onedir/);
});

test('Windows Node runtime prep copies node.exe into desktop resources', async () => {
  const script = await readFile(new URL('../../scripts/prepare-windows-node-runtime.ps1', import.meta.url), 'utf8');

  assert.match(script, /desktop\\resources\\node-runtime/);
  assert.match(script, /node\.exe/);
  assert.match(script, /Get-Command node/);
  assert.match(script, /prepare-desktop-node-modules\.mjs/);
});

test('Electron main resolves the executable inside the macOS onedir backend bundle', async () => {
  const source = await readFile(new URL('../../desktop/main.cjs', import.meta.url), 'utf8');

  assert.match(source, /path\.join\(resourcesRoot, 'backend', backendExecutableName, backendExecutableName\)/);
  assert.match(source, /packagedBackendCandidates\.find/);
});

test('Electron backend restart invalidates an in-flight start without letting the old child clear the new one', async () => {
  const source = await readFile(new URL('../../desktop/main.cjs', import.meta.url), 'utf8');

  assert.match(source, /backendStartGeneration\s*\+=\s*1/);
  assert.match(source, /backendStartPromise\s*=\s*null/);
  assert.match(source, /backendProcess\s*===\s*child/);
  assert.match(source, /backendStartGeneration\s*===\s*startGeneration/);
});

test('Electron health polling fails fast on 4xx responses with backend detail', async () => {
  const source = await readFile(new URL('../../desktop/main.cjs', import.meta.url), 'utf8');

  assert.match(source, /response\.status\s*>=\s*400\s*&&\s*response\.status\s*<\s*500/);
  assert.match(source, /await\s+readHealthError\(response\)/);
  assert.match(source, /throw\s+new\s+Error\(`Backend health check failed:\s*\$\{detail\}`\)/);
});

test('Electron main restarts the local backend from renderer proxy disconnects', async () => {
  const source = await readFile(new URL('../../desktop/main.cjs', import.meta.url), 'utf8');

  assert.match(source, /recoverBackendFromRendererProxy/);
  assert.match(source, /desktop\.backendReady/);
  assert.match(source, /desktop\.backendFailed/);
  assert.match(source, /Local backend proxy failed/);
});

test('desktop development reuses the fixed Vite backend proxy target', async () => {
  const runnerSource = await readFile(new URL('../../desktop/dev-runner.cjs', import.meta.url), 'utf8');
  const mainSource = await readFile(new URL('../../desktop/main.cjs', import.meta.url), 'utf8');

  assert.match(runnerSource, /devBackendUrl\s*=\s*'http:\/\/127\.0\.0\.1:3004'/);
  assert.match(runnerSource, /\['run', 'dev:backend'\]/);
  assert.match(runnerSource, /\['run', 'dev:frontend'\]/);
  assert.match(runnerSource, /SEO_WP_SYNC_EXTERNAL_BACKEND_URL:\s*devBackendUrl/);
  assert.match(mainSource, /SEO_WP_SYNC_EXTERNAL_BACKEND_URL/);
  assert.match(mainSource, /using external backend/);
});

test('Electron main uses a native macOS desktop shell and system theme source', async () => {
  const mainSource = await readFile(new URL('../../desktop/main.cjs', import.meta.url), 'utf8');
  const preloadSource = await readFile(new URL('../../desktop/preload.cjs', import.meta.url), 'utf8');

  assert.match(mainSource, /nativeTheme\.themeSource\s*=\s*'system'/);
  assert.match(mainSource, /titleBarStyle:\s*process\.platform === 'darwin' \? 'hiddenInset' : 'default'/);
  assert.match(mainSource, /trafficLightPosition:/);
  assert.match(mainSource, /backgroundColor:\s*getWindowBackgroundColor\(process\.platform, nativeTheme\.shouldUseDarkColors\)/);
  assert.match(mainSource, /minWidth:\s*1100/);
  assert.doesNotMatch(mainSource, /backgroundColor:\s*'#00000000'/);
  assert.doesNotMatch(mainSource, /vibrancy:/);
  assert.doesNotMatch(mainSource, /visualEffectState:/);
  assert.match(mainSource, /desktop\.setThemeSource/);
  assert.match(preloadSource, /getThemeInfo/);
  assert.match(preloadSource, /setThemeSource/);
  assert.match(preloadSource, /onThemeUpdated/);
});

test('Electron desktop bridge exposes a JSON file selector for Vertex credentials', async () => {
  const mainSource = await readFile(new URL('../../desktop/main.cjs', import.meta.url), 'utf8');
  const preloadSource = await readFile(new URL('../../desktop/preload.cjs', import.meta.url), 'utf8');
  const apiClientSource = await readFile(new URL('../../services/apiClient.ts', import.meta.url), 'utf8');

  assert.match(mainSource, /ipcMain\.handle\('desktop\.selectJsonFile'/);
  assert.match(mainSource, /dialog\.showOpenDialog\(mainWindow/);
  assert.match(mainSource, /properties:\s*\[\s*'openFile'\s*\]/);
  assert.match(mainSource, /filters:\s*\[\s*\{\s*name:\s*'JSON'/);
  assert.match(mainSource, /extensions:\s*\[\s*'json'\s*\]/);
  assert.match(mainSource, /if \(result\.canceled \|\| !result\.filePaths\?\.length\) return null/);
  assert.match(mainSource, /return result\.filePaths\[0\]/);
  assert.match(preloadSource, /selectJsonFile:\s*\(\) => ipcRenderer\.invoke\('desktop\.selectJsonFile'\)/);
  assert.match(apiClientSource, /selectJsonFile:\s*\(\) => Promise<string \| null>/);
});

test('Electron main enforces a single app instance and reuses the existing window', async () => {
  const mainSource = await readFile(new URL('../../desktop/main.cjs', import.meta.url), 'utf8');

  assert.match(mainSource, /requestSingleInstanceLock\(\)/);
  assert.match(mainSource, /app\.on\('second-instance'/);
  assert.match(mainSource, /focusMainWindow/);
  assert.match(mainSource, /mainWindow\.restore\(\)/);
  assert.match(mainSource, /mainWindow\.show\(\)/);
  assert.match(mainSource, /mainWindow\.focus\(\)/);
  assert.match(mainSource, /creatingWindowPromise/);
});
