const { app, BrowserWindow, Menu, ipcMain, shell, dialog, nativeTheme, net: electronNet, protocol } = require('electron');
const fs = require('fs');
const http = require('http');
const nodeNet = require('net');
const os = require('os');
const path = require('path');
const { migrateLegacyLocalStorage } = require('./local-storage-migration.cjs');
const { spawnWithLog, terminateProcessTree } = require('./process-supervisor.cjs');
const {
  attachWindowsDevShortcuts,
  getWindowBackgroundColor,
  installWindowsMenu,
} = require('./windows-shell.cjs');

const DISPLAY_NAME = '独立站 AI';
const STORAGE_NAME = 'SeoWpSync';
const APP_SCHEME = 'app';
const APP_HOST = 'seo-desktop';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const HEALTH_TIMEOUT_MS = 120000;
const UPDATE_CHECK_DELAY_MS = 15000;
const UPDATE_RELEASE_OWNER = 'jinhongr10';
const UPDATE_RELEASE_REPO = 'SEO-WP';
const UPDATE_RELEASE_REPO_LABEL = `${UPDATE_RELEASE_OWNER}/${UPDATE_RELEASE_REPO}`;
const UPDATE_FEED_CONFIG = {
  provider: 'github',
  owner: UPDATE_RELEASE_OWNER,
  repo: UPDATE_RELEASE_REPO,
  private: false,
};

protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
}]);

let mainWindow = null;
let backendProcess = null;
let backendUrl = '';
let backendReady = false;
let backendStartPromise = null;
let backendStartGeneration = 0;
let rendererServer = null;
let rendererUrl = '';
let runtimePaths = null;
let creatingWindowPromise = null;
let autoUpdaterConfigured = false;
let autoUpdaterInstance = null;
let updateStatus = {
  phase: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: '',
  progress: 0,
  lastCheckedAt: '',
  errorMessage: '',
};

app.setName(DISPLAY_NAME);
nativeTheme.themeSource = 'system';

const isPackaged = () => app.isPackaged;

const isUpdatePlatformSupported = () => (
  isPackaged() && (process.platform === 'darwin' || process.platform === 'win32')
);

const serializeUpdateStatus = () => ({
  phase: String(updateStatus.phase || 'idle'),
  currentVersion: app.getVersion(),
  latestVersion: String(updateStatus.latestVersion || ''),
  progress: Number.isFinite(Number(updateStatus.progress))
    ? Math.max(0, Math.min(100, Number(updateStatus.progress)))
    : 0,
  lastCheckedAt: String(updateStatus.lastCheckedAt || ''),
  errorMessage: String(updateStatus.errorMessage || ''),
});

const broadcastUpdateStatus = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('desktop.updates.status', serializeUpdateStatus());
};

const setUpdateStatus = (patch, shouldBroadcast = true) => {
  const nextPhase = patch.phase || updateStatus.phase || 'idle';
  updateStatus = {
    ...updateStatus,
    ...patch,
    phase: nextPhase,
    currentVersion: app.getVersion(),
    errorMessage: nextPhase === 'error' ? String(patch.errorMessage || updateStatus.errorMessage || '') : String(patch.errorMessage || ''),
  };
  if (!Number.isFinite(Number(updateStatus.progress))) updateStatus.progress = 0;
  updateStatus.progress = Math.max(0, Math.min(100, Number(updateStatus.progress)));
  if (shouldBroadcast) broadcastUpdateStatus();
  return serializeUpdateStatus();
};

const getUpdateStatus = () => {
  if (!isUpdatePlatformSupported()) {
    return {
      ...serializeUpdateStatus(),
      phase: 'unsupported',
      errorMessage: isPackaged()
        ? '当前系统暂不支持自动更新。'
        : '开发模式不会检查桌面应用更新。',
    };
  }
  return serializeUpdateStatus();
};

const getRawUpdateError = (error) => String(error?.stack || error?.message || error || 'Unknown update error');

const getUserFacingUpdateError = (rawMessage) => {
  const message = String(rawMessage || '');
  if (/app-update\.ya?ml/i.test(message) && /ENOENT|no such file or directory/i.test(message)) {
    return `更新配置文件缺失：当前安装包没有 app-update.yml，无法连接 GitHub Releases。请用最新打包脚本重新生成 App，更新源应指向 ${UPDATE_RELEASE_REPO_LABEL}。`;
  }
  if (/latest-mac\.yml|latest\.yml|Cannot find.*latest|404/i.test(message)) {
    return `GitHub Releases 里还没有找到可用更新元数据。请确认 ${UPDATE_RELEASE_REPO_LABEL} 已发布对应版本的安装包和 latest 更新文件。`;
  }
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ERR_INTERNET_DISCONNECTED|net::ERR/i.test(message)) {
    return '暂时无法连接 GitHub Releases，请检查网络后再试。';
  }
  return message || '更新检查失败，请稍后重试。';
};

const checkForDesktopUpdates = async () => {
  const autoUpdater = configureAutoUpdater();
  if (!autoUpdater) return getUpdateStatus();

  setUpdateStatus({
    phase: 'checking',
    progress: 0,
    lastCheckedAt: new Date().toISOString(),
    errorMessage: '',
  });

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const rawMessage = getRawUpdateError(error);
    const message = getUserFacingUpdateError(rawMessage);
    appendBackendLog(`auto updater check failed: ${rawMessage}`);
    setUpdateStatus({
      phase: 'error',
      progress: 0,
      lastCheckedAt: new Date().toISOString(),
      errorMessage: message,
    });
  }

  return getUpdateStatus();
};

const loadAutoUpdater = () => {
  const candidates = [
    'electron-updater',
    getResourcePath('node_modules', 'electron-updater'),
  ];

  for (const candidate of candidates) {
    try {
      const updaterModule = require(candidate);
      if (updaterModule?.autoUpdater) return updaterModule.autoUpdater;
    } catch (error) {
      appendBackendLog(`auto updater module not available from ${candidate}: ${error.message || error}`);
    }
  }
  return null;
};

const configureAutoUpdater = () => {
  if (!isUpdatePlatformSupported()) return null;
  if (autoUpdaterConfigured && autoUpdaterInstance) return autoUpdaterInstance;

  runtimePaths = runtimePaths || resolveRuntimePaths();
  const autoUpdater = loadAutoUpdater();
  if (!autoUpdater) {
    appendBackendLog('auto updater disabled: electron-updater module not found');
    setUpdateStatus({
      phase: 'unsupported',
      errorMessage: 'electron-updater module not found',
    });
    return null;
  }

  autoUpdaterConfigured = true;
  autoUpdaterInstance = autoUpdater;
  if (typeof autoUpdater.setFeedURL === 'function') {
    autoUpdater.setFeedURL(UPDATE_FEED_CONFIG);
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    appendBackendLog('auto updater checking for updates');
    setUpdateStatus({
      phase: 'checking',
      progress: 0,
      lastCheckedAt: new Date().toISOString(),
      errorMessage: '',
    });
  });
  autoUpdater.on('update-available', (info) => {
    appendBackendLog(`auto updater update available: ${info?.version || 'unknown version'}`);
    setUpdateStatus({
      phase: 'available',
      latestVersion: info?.version || '',
      progress: 0,
      errorMessage: '',
    });
    setUpdateStatus({
      phase: 'downloading',
      latestVersion: info?.version || '',
      progress: 0,
      errorMessage: '',
    });
    autoUpdater.downloadUpdate().catch((error) => {
      const rawMessage = getRawUpdateError(error);
      const message = getUserFacingUpdateError(rawMessage);
      appendBackendLog(`auto updater download failed: ${rawMessage}`);
      setUpdateStatus({
        phase: 'error',
        latestVersion: info?.version || updateStatus.latestVersion || '',
        errorMessage: message,
      });
    });
  });
  autoUpdater.on('update-not-available', (info) => {
    appendBackendLog(`auto updater no update available: ${info?.version || 'unknown version'}`);
    setUpdateStatus({
      phase: 'not-available',
      latestVersion: info?.version || app.getVersion(),
      progress: 0,
      lastCheckedAt: new Date().toISOString(),
      errorMessage: '',
    });
  });
  autoUpdater.on('download-progress', (progress) => {
    const percent = Number(progress?.percent || 0);
    appendBackendLog(`auto updater download progress: ${Math.round(percent)}%`);
    setUpdateStatus({
      phase: 'downloading',
      progress: percent,
      errorMessage: '',
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    appendBackendLog(`auto updater update downloaded: ${info?.version || 'unknown version'}; waiting for restart`);
    setUpdateStatus({
      phase: 'downloaded',
      latestVersion: info?.version || updateStatus.latestVersion || '',
      progress: 100,
      errorMessage: '',
    });
  });
  autoUpdater.on('error', (error) => {
    const rawMessage = getRawUpdateError(error);
    const message = getUserFacingUpdateError(rawMessage);
    appendBackendLog(`auto updater failed: ${rawMessage}`);
    setUpdateStatus({
      phase: 'error',
      errorMessage: message,
    });
  });

  setTimeout(() => {
    checkForDesktopUpdates();
  }, UPDATE_CHECK_DELAY_MS);

  return autoUpdater;
};

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
};

const macPath = (kind) => {
  const home = os.homedir();
  if (kind === 'logs') return path.join(home, 'Library', 'Logs', STORAGE_NAME);
  if (kind === 'cache') return path.join(home, 'Library', 'Caches', STORAGE_NAME);
  return path.join(home, 'Library', 'Application Support', STORAGE_NAME);
};

const resolveRuntimePaths = () => {
  let dataDir = app.getPath('userData');
  let logsDir = path.join(dataDir, 'logs');
  let cacheDir = path.join(dataDir, 'cache');

  if (process.platform === 'darwin') {
    dataDir = macPath('data');
    logsDir = macPath('logs');
    cacheDir = macPath('cache');
  }

  return {
    dataDir: ensureDir(dataDir),
    logsDir: ensureDir(logsDir),
    cacheDir: ensureDir(cacheDir),
    cacheOriginalDir: ensureDir(path.join(cacheDir, 'original')),
    cacheOptimizedDir: ensureDir(path.join(cacheDir, 'optimized')),
  };
};

const getFreePort = () => new Promise((resolve, reject) => {
  const server = nodeNet.createServer();
  server.unref();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});

const appendBackendLog = (message) => {
  if (!runtimePaths) return;
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFile(path.join(runtimePaths.logsDir, 'backend-launch.log'), line, () => {});
};

const getProjectRoot = () => {
  if (isPackaged()) return process.resourcesPath;
  return path.resolve(__dirname, '..');
};

const getRendererDistDir = () => path.join(__dirname, '..', 'dist');

const getResourcePath = (...parts) => path.join(getProjectRoot(), ...parts);

const getPackagedNodeRuntime = () => {
  const candidate = process.platform === 'win32'
    ? getResourcePath('node-runtime', 'node.exe')
    : getResourcePath('node-runtime', 'bin', 'node');
  return fs.existsSync(candidate) ? candidate : '';
};

const getBackendCommand = (port) => {
  const resourcesRoot = getProjectRoot();
  const backendExecutableName = process.platform === 'win32'
    ? 'seo-wp-sync-backend.exe'
    : 'seo-wp-sync-backend';
  const packagedBackendCandidates = [
    path.join(resourcesRoot, 'backend', backendExecutableName, backendExecutableName),
    path.join(resourcesRoot, 'backend', backendExecutableName),
  ];
  const packagedBackend = packagedBackendCandidates.find((candidate) => fs.existsSync(candidate)) || '';

  if (isPackaged() && packagedBackend) {
    return {
      command: packagedBackend,
      args: ['--host', '127.0.0.1', '--port', String(port)],
      cwd: resourcesRoot,
    };
  }

  if (isPackaged()) {
    throw new Error(
      `Packaged backend is missing. Checked: ${packagedBackendCandidates.join(', ')}. `
      + 'Reinstall the application and check Windows Security > Protection history.',
    );
  }

  const projectRoot = path.resolve(__dirname, '..');
  const venvPython = process.platform === 'win32'
    ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, '.venv', 'bin', 'python');
  const python = fs.existsSync(venvPython) ? venvPython : 'python3';

  return {
    command: python,
    args: ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', String(port)],
    cwd: projectRoot,
  };
};

const readHealthError = async (response) => {
  try {
    const payload = await response.json();
    return String(payload?.detail || payload?.error || payload?.message || `HTTP ${response.status}`);
  } catch {
    return `HTTP ${response.status}`;
  }
};

const waitForHealth = async (url, isCancelled = () => false) => {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < HEALTH_TIMEOUT_MS) {
    if (isCancelled()) throw new Error('Backend startup cancelled');
    let response;
    try {
      response = await fetch(`${url}/desktop/health`);
    } catch (error) {
      if (isCancelled()) throw new Error('Backend startup cancelled');
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400));
      continue;
    }
    if (response.ok) return await response.json();
    const detail = await readHealthError(response);
    if (response.status >= 400 && response.status < 500) {
      throw new Error(`Backend health check failed: ${detail}`);
    }
    lastError = new Error(`Backend health check failed: ${detail}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw lastError || new Error('Backend health check timed out');
};

const getExternalBackendUrl = () => (
  String(process.env.SEO_WP_SYNC_EXTERNAL_BACKEND_URL || '').trim().replace(/\/+$/, '')
);

const stopBackend = async () => {
  backendStartGeneration += 1;
  backendStartPromise = null;
  if (!backendProcess) return;
  const child = backendProcess;
  backendProcess = null;
  backendReady = false;
  try {
    await terminateProcessTree(child);
  } catch (error) {
    appendBackendLog(`backend process tree termination failed: ${error.stack || error.message || error}`);
    throw error;
  }
};

const startBackend = async () => {
  if (backendReady && backendUrl) return backendUrl;
  if (backendStartPromise) return backendStartPromise;

  const startGeneration = backendStartGeneration + 1;
  backendStartGeneration = startGeneration;
  const startPromise = (async () => {
    if (backendReady && backendUrl) return backendUrl;

    runtimePaths = resolveRuntimePaths();
    const externalBackendUrl = getExternalBackendUrl();
    if (externalBackendUrl) {
      backendUrl = externalBackendUrl;
      backendReady = false;
      appendBackendLog(`using external backend: ${backendUrl}`);
      await waitForHealth(backendUrl);
      backendReady = true;
      return backendUrl;
    }

    const port = await getFreePort();
    backendUrl = `http://127.0.0.1:${port}`;
    backendReady = false;
    const backend = getBackendCommand(port);
    const backendLogPath = path.join(runtimePaths.logsDir, 'backend.log');
    const env = {
      ...process.env,
      SEO_WP_SYNC_DATA_DIR: runtimePaths.dataDir,
      SEO_WP_SYNC_LOG_DIR: runtimePaths.logsDir,
      SEO_WP_SYNC_CACHE_DIR: runtimePaths.cacheDir,
      SEO_WP_SYNC_DESKTOP_RUNTIME: '1',
      SEO_WP_SYNC_BACKEND_URL: backendUrl,
      SEO_WP_SYNC_BACKEND_PORT: String(port),
      SEO_WP_SYNC_APP_VERSION: app.getVersion(),
      SEO_WP_SYNC_NODE_CLI_PATH: getResourcePath('dist-cli', 'cli.js'),
      SEO_WP_SYNC_NODE_RUNTIME: getPackagedNodeRuntime() || process.env.SEO_WP_SYNC_NODE_RUNTIME || 'node',
      LOG_DIR: runtimePaths.logsDir,
      CACHE_ORIGINAL_DIR: runtimePaths.cacheOriginalDir,
      CACHE_OPTIMIZED_DIR: runtimePaths.cacheOptimizedDir,
      SEO_WP_SYNC_LOAD_PROJECT_DOTENV: process.env.SEO_WP_SYNC_LOAD_PROJECT_DOTENV || 'false',
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
    };

    appendBackendLog(`starting backend: ${backend.command} ${backend.args.join(' ')}`);
    const child = await spawnWithLog({
      command: backend.command,
      args: backend.args,
      cwd: backend.cwd,
      env,
      logPath: backendLogPath,
    });
    backendProcess = child;

    child.once('exit', (code, signal) => {
      appendBackendLog(`backend exited code=${code ?? ''} signal=${signal ?? ''}`);
      if (backendProcess === child) {
        backendProcess = null;
        backendReady = false;
      }
    });

    try {
      await waitForHealth(backendUrl, () => backendStartGeneration !== startGeneration);
      if (backendStartGeneration !== startGeneration) throw new Error('Backend startup cancelled');
      backendReady = true;
    } catch (error) {
      if (backendStartGeneration === startGeneration) await stopBackend();
      throw error;
    }

    return backendUrl;
  })();
  backendStartPromise = startPromise;

  try {
    return await startPromise;
  } finally {
    if (backendStartPromise === startPromise) backendStartPromise = null;
  }
};

let backendRecoveryPromise = null;

const sendBackendReady = (url) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('desktop.backendReady', { backendUrl: url });
};

const sendBackendFailed = (error) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('desktop.backendFailed', {
    message: String(error?.message || error),
  });
};

const recoverBackendFromRendererProxy = (reason, forceRestart = false) => {
  if (backendRecoveryPromise) return backendRecoveryPromise;
  appendBackendLog(`renderer proxy requested backend recovery: ${reason}`);
  backendRecoveryPromise = (async () => {
    if (forceRestart && backendProcess && !getExternalBackendUrl()) {
      await stopBackend();
    }
    const url = await startBackend();
    return url;
  })()
    .then((url) => {
      sendBackendReady(url);
      return url;
    })
    .catch((error) => {
      appendBackendLog(`renderer proxy backend recovery failed: ${error.stack || error.message || error}`);
      sendBackendFailed(error);
      throw error;
    })
    .finally(() => {
      backendRecoveryPromise = null;
    });
  return backendRecoveryPromise;
};

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const sendStaticFile = (res, filePath) => {
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-length': stat.size,
      'content-type': contentTypes[ext] || 'application/octet-stream',
    });
    fs.createReadStream(filePath).pipe(res);
  });
};

const proxyApiRequest = (req, res) => {
  const incomingUrl = new URL(req.url, rendererUrl);
  if (!backendUrl || !backendReady) {
    recoverBackendFromRendererProxy('backend not ready').catch(() => {});
    res.writeHead(503, {
      'content-type': 'application/json; charset=utf-8',
      'retry-after': '1',
    });
    res.end(JSON.stringify({ detail: 'Local backend is still starting' }));
    return;
  }
  const targetUrl = new URL(`${backendUrl}${incomingUrl.pathname.replace(/^\/api/, '') || '/'}${incomingUrl.search}`);
  const headers = { ...req.headers, host: targetUrl.host };
  delete headers['content-length'];

  const proxyReq = http.request(targetUrl, {
    method: req.method,
    headers,
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    appendBackendLog(`renderer proxy failed: ${error.stack || error.message || error}`);
    backendReady = false;
    recoverBackendFromRendererProxy(`proxy failed: ${error.message || error}`, true).catch(() => {});
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ detail: 'Local backend proxy failed' }));
  });

  req.pipe(proxyReq);
};

const startRendererServer = async () => {
  if (rendererServer && rendererUrl) return rendererUrl;

  const distDir = getRendererDistDir();
  const indexFile = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    throw new Error(`Renderer build missing: ${indexFile}. Run npm run build:web first.`);
  }

  rendererUrl = APP_ORIGIN;
  await protocol.handle(APP_SCHEME, async (request) => {
    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.host !== APP_HOST) {
        return new Response('Forbidden', { status: 403 });
      }
      if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
        if (!backendUrl || !backendReady) {
          recoverBackendFromRendererProxy('backend not ready').catch(() => {});
          return Response.json(
            { detail: 'Local backend is still starting' },
            { status: 503, headers: { 'retry-after': '1' } },
          );
        }

        const targetUrl = new URL(
          `${backendUrl}${requestUrl.pathname.replace(/^\/api/, '') || '/'}${requestUrl.search}`,
        );
        const headers = new Headers(request.headers);
        headers.delete('host');
        headers.delete('content-length');
        headers.delete('origin');
        const init = {
          method: request.method,
          headers,
        };
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          init.body = request.body;
        }
        try {
          return await electronNet.fetch(targetUrl.toString(), init);
        } catch (error) {
          appendBackendLog(`renderer protocol proxy failed: ${error.stack || error.message || error}`);
          backendReady = false;
          recoverBackendFromRendererProxy(`proxy failed: ${error.message || error}`, true).catch(() => {});
          return Response.json({ detail: 'Local backend proxy failed' }, { status: 502 });
        }
      }

      const decodedPath = decodeURIComponent(requestUrl.pathname);
      const normalizedPath = decodedPath === '/' ? '/index.html' : decodedPath;
      const candidate = path.normalize(path.join(distDir, normalizedPath));
      const relativeCandidate = path.relative(distDir, candidate);
      if (relativeCandidate.startsWith('..') || path.isAbsolute(relativeCandidate)) {
        return new Response('Forbidden', { status: 403 });
      }

      const selectedFile = fs.existsSync(candidate) && fs.statSync(candidate).isFile()
        ? candidate
        : indexFile;
      const ext = path.extname(selectedFile).toLowerCase();
      const headers = {
        'content-type': contentTypes[ext] || 'application/octet-stream',
      };
      if (ext === '.html') {
        headers['content-security-policy'] = [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'none'",
          "frame-src 'self' https:",
        ].join('; ');
      }
      return new Response(fs.readFileSync(selectedFile), { status: 200, headers });
    } catch (error) {
      appendBackendLog(`renderer protocol failed: ${error.stack || error.message || error}`);
      return new Response('Renderer protocol error', { status: 500 });
    }
  });
  rendererServer = true;
  return rendererUrl;
};

const stopRendererServer = () => {
  if (!rendererServer) return;
  rendererServer = null;
  rendererUrl = '';
  protocol.unhandle(APP_SCHEME);
};

const focusMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  return true;
};

const createWindow = async () => {
  if (focusMainWindow()) return mainWindow;
  if (creatingWindowPromise) return creatingWindowPromise;

  creatingWindowPromise = (async () => {
    if (focusMainWindow()) return mainWindow;
    const backendStartupPromise = startBackend();
    const rendererUrlPromise = process.env.VITE_DEV_SERVER_URL
      ? Promise.resolve(process.env.VITE_DEV_SERVER_URL)
      : startRendererServer();

    const window = new BrowserWindow({
      show: false,
      width: 1320,
      height: 860,
      minWidth: 1100,
      minHeight: 720,
      title: DISPLAY_NAME,
      backgroundColor: getWindowBackgroundColor(process.platform, nativeTheme.shouldUseDarkColors),
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 16 } : undefined,
      autoHideMenuBar: process.platform === 'win32',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'preload.cjs'),
      },
    });

    mainWindow = window;
    if (process.platform === 'win32') {
      window.setMenuBarVisibility(false);
      window.setMenu(null);
      attachWindowsDevShortcuts({
        platform: process.platform,
        isDevelopment: !app.isPackaged,
        window,
      });
    }
    window.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const target = new URL(url);
        if (target.protocol === 'https:') shell.openExternal(target.toString());
      } catch {
        appendBackendLog(`blocked invalid window open URL: ${String(url || '')}`);
      }
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith(`${APP_ORIGIN}/`) || url === APP_ORIGIN) return;
      if (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)) return;
      event.preventDefault();
      appendBackendLog(`blocked renderer navigation: ${url}`);
    });
    window.on('closed', () => {
      if (mainWindow === window) mainWindow = null;
    });

    await window.loadURL(await rendererUrlPromise);
    if (!process.env.VITE_DEV_SERVER_URL) {
      const migration = await migrateLegacyLocalStorage({
        BrowserWindow,
        targetWindow: window,
        userDataDir: app.getPath('userData'),
        logger: appendBackendLog,
      });
      if (migration.migrated) await window.reload();
    }
    window.show();

    backendStartupPromise
      .then((url) => {
        if (!window.isDestroyed()) sendBackendReady(url);
      })
      .catch((error) => {
        appendBackendLog(`background backend startup failed: ${error.stack || error.message || error}`);
        if (!window.isDestroyed()) sendBackendFailed(error);
      });

    return window;
  })();

  try {
    return await creatingWindowPromise;
  } finally {
    creatingWindowPromise = null;
  }
};

ipcMain.on('desktop.getBackendUrlSync', (event) => {
  event.returnValue = backendUrl;
});

ipcMain.handle('desktop.getBackendUrl', async () => backendUrl);

const getThemeInfo = () => ({
  themeSource: nativeTheme.themeSource,
  shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
});

ipcMain.handle('desktop.getThemeInfo', async () => getThemeInfo());

ipcMain.handle('desktop.setThemeSource', async (_event, source) => {
  const nextSource = ['system', 'light', 'dark'].includes(source) ? source : 'system';
  nativeTheme.themeSource = nextSource;
  return getThemeInfo();
});

nativeTheme.on('updated', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (process.platform === 'win32') {
    mainWindow.setBackgroundColor(getWindowBackgroundColor(process.platform, nativeTheme.shouldUseDarkColors));
  }
  mainWindow.webContents.send('desktop.themeUpdated', getThemeInfo());
});

ipcMain.handle('desktop.openPath', async (_event, kind) => {
  const paths = runtimePaths || resolveRuntimePaths();
  const target = {
    data: paths.dataDir,
    logs: paths.logsDir,
    cache: paths.cacheDir,
  }[kind];
  if (!target) throw new Error(`Unknown path kind: ${kind}`);
  const error = await shell.openPath(target);
  if (error) throw new Error(error);
  return target;
});

ipcMain.handle('desktop.selectJsonFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Vertex 服务账号 JSON',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths?.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('desktop.restartBackend', async () => {
  await stopBackend();
  return startBackend();
});

ipcMain.handle('desktop.exportDiagnostics', async () => {
  const paths = runtimePaths || resolveRuntimePaths();
  const defaultPath = path.join(paths.logsDir, `diagnostics-${Date.now()}.json`);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出诊断信息',
    defaultPath,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;

  const payload = {
    generatedAt: new Date().toISOString(),
    backendUrl,
    paths,
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
  };
  fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return result.filePath;
});

ipcMain.handle('desktop.updates.getStatus', async () => getUpdateStatus());

ipcMain.handle('desktop.updates.check', async () => checkForDesktopUpdates());

ipcMain.handle('desktop.updates.install', async () => {
  const autoUpdater = configureAutoUpdater();
  if (!autoUpdater) return getUpdateStatus();
  if (updateStatus.phase !== 'downloaded') return getUpdateStatus();

  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (error) {
      const rawMessage = getRawUpdateError(error);
      const message = getUserFacingUpdateError(rawMessage);
      appendBackendLog(`auto updater install failed: ${rawMessage}`);
      setUpdateStatus({
        phase: 'error',
        errorMessage: message,
      });
    }
  }, 100);

  return getUpdateStatus();
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (focusMainWindow()) return;
    createWindow().catch((error) => {
      appendBackendLog(`second-instance focus failed: ${error.stack || error.message || error}`);
    });
  });

  app.whenReady()
    .then(async () => {
      // Windows: remove native File/Edit/View menu strip for a clean title bar.
      installWindowsMenu({
        platform: process.platform,
        Menu,
      });
      await createWindow();
      configureAutoUpdater();
    })
    .catch(async (error) => {
      appendBackendLog(`startup failed: ${error.stack || error.message || error}`);
      await dialog.showErrorBox('独立站 AI 启动失败', String(error.message || error));
      app.quit();
    });
}

let shutdownStarted = false;
let shutdownComplete = false;
app.on('before-quit', (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  Promise.resolve()
    .then(() => stopBackend())
    .catch((error) => appendBackendLog(`shutdown failed: ${error.stack || error.message || error}`))
    .finally(() => {
      stopRendererServer();
      shutdownComplete = true;
      app.quit();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (focusMainWindow()) return;
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      appendBackendLog(`activate failed: ${error.stack || error.message || error}`);
    });
  }
});
