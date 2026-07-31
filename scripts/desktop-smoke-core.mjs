import http from 'node:http';
import path from 'node:path';

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    server.off('error', reject);
    resolve();
  });
});

const close = server => new Promise(resolve => server.close(() => resolve()));

const serverUrl = server => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Smoke server did not expose a TCP address.');
  return `http://127.0.0.1:${address.port}`;
};

export const createSmokeServers = async () => {
  let rendererRequested = false;
  const unhandledBackendRequests = [];
  const backend = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (request.url === '/desktop/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, smoke: true }));
      return;
    }
    if (requestUrl.pathname === '/settings') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ aiProvider: 'gemini', backendUrl: '/api', secretRefs: {} }));
      return;
    }
    if (requestUrl.pathname === '/site-profiles/summary') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ company: { name: '' }, activeSiteId: '', sites: [] }));
      return;
    }
    if (requestUrl.pathname === '/setup/status') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ registered: false, setupComplete: false, siteCreated: false, checks: [] }));
      return;
    }
    if (requestUrl.pathname === '/knowledge/sources') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, sources: [] }));
      return;
    }
    if (requestUrl.pathname === '/site-profiles' || requestUrl.pathname === '/site-profiles/summary') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ company: { name: '' }, activeSiteId: '', sites: [] }));
      return;
    }
    if (requestUrl.pathname === '/system/network-status') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        ok: true,
        checkedAt: new Date().toISOString(),
        summary: 'Smoke services are available',
        problemArea: 'none',
        checks: [],
      }));
      return;
    }
    if (requestUrl.pathname === '/seo-health/summary') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        score: 100,
        label: 'Healthy',
        updatedAt: '',
        critical: 0,
        warningsCount: 0,
        notices: 0,
        generatedUnsynced: 0,
        groups: [],
        issues: [],
        warnings: [],
      }));
      return;
    }
    if (requestUrl.pathname === '/seo-gaps/cache-status') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        media: { hasCache: false, total: 0, latestUpdatedAt: '', oldestUpdatedAt: '' },
        product: { hasCache: false, total: 0, latestLastScannedAt: '', oldestLastScannedAt: '' },
        task: { isRunning: false, operation: null, lastError: null },
      }));
      return;
    }
    if (requestUrl.pathname === '/seo-gaps/search') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        items: [],
        total: 0,
        limit: Number(requestUrl.searchParams.get('limit') || 20),
        offset: Number(requestUrl.searchParams.get('offset') || 0),
      }));
      return;
    }
    if (requestUrl.pathname === '/daily-seo/tasks') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ items: [], total: 0 }));
      return;
    }
    if (requestUrl.pathname === '/daily-seo/runs/current') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end('null');
      return;
    }
    if (requestUrl.pathname === '/daily-seo/settings') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        enabled: false,
        time: '02:00',
        timezone: 'UTC',
        lastRunDate: '',
        lastRunId: '',
        nextRunAt: '',
      }));
      return;
    }
    if (requestUrl.pathname === '/ai/status') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        ok: false,
        configured: false,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        detail: 'AI is not configured in the isolated smoke environment.',
      }));
      return;
    }
    unhandledBackendRequests.push(`${request.method || 'GET'} ${requestUrl.pathname}`);
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ detail: 'Smoke endpoint not found' }));
  });
  const renderer = http.createServer((_request, response) => {
    rendererRequested = true;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>Desktop smoke ready</title></head><body>Desktop smoke ready</body></html>');
  });
  await Promise.all([listen(backend), listen(renderer)]);

  return {
    backendUrl: serverUrl(backend),
    rendererUrl: serverUrl(renderer),
    rendererWasRequested: () => rendererRequested,
    unhandledBackendRequests: () => [...unhandledBackendRequests],
    close: () => Promise.all([close(backend), close(renderer)]),
  };
};

export const getIsolatedSmokeEnvironment = (homeDir, { backendUrl, rendererUrl }, { realSidecar = false } = {}) => ({
  ...process.env,
  HOME: homeDir,
  USERPROFILE: homeDir,
  XDG_CONFIG_HOME: path.join(homeDir, '.config'),
  XDG_CACHE_HOME: path.join(homeDir, '.cache'),
  SEO_WP_SYNC_DATA_DIR: path.join(homeDir, 'data'),
  SEO_WP_SYNC_LOG_DIR: path.join(homeDir, 'logs'),
  SEO_WP_SYNC_CACHE_DIR: path.join(homeDir, 'cache'),
  ...(realSidecar ? {} : { SEO_WP_SYNC_EXTERNAL_BACKEND_URL: backendUrl }),
  SEO_WP_SYNC_LOAD_PROJECT_DOTENV: 'false',
  VITE_DEV_SERVER_URL: rendererUrl,
});

export const resolveElectronExecutable = (projectRoot, platform, explicitPath = '') => {
  if (explicitPath) return explicitPath;
  if (platform === 'darwin') {
    return path.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
  }
  if (platform === 'win32') return path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  return path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron');
};
