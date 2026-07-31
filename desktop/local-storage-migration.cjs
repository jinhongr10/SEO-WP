const fs = require('fs');
const http = require('http');
const path = require('path');

const MIGRATION_MARKER = 'renderer-origin-migration-v1.json';
const MAX_ORIGINS = 12;
const MAX_VALUE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

const discoverLegacyRendererOrigins = (leveldbDir) => {
  if (!fs.existsSync(leveldbDir)) return [];
  const origins = new Map();
  const patterns = [
    /http:\/\/127\.0\.0\.1:(\d{2,5})/g,
    /_http:\/\/127\.0\.0\.1_(\d{2,5})/g,
    /http_127\.0\.0\.1_(\d{2,5})/g,
  ];
  for (const name of fs.readdirSync(leveldbDir)) {
    const filePath = path.join(leveldbDir, name);
    let stat;
    try {
      stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > 64 * 1024 * 1024) continue;
      const text = fs.readFileSync(filePath).toString('latin1');
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
          const port = Number(match[1]);
          if (port < 1024 || port > 65535) continue;
          const origin = `http://127.0.0.1:${port}`;
          origins.set(origin, Math.max(origins.get(origin) || 0, stat.mtimeMs));
        }
      }
    } catch {
      // LevelDB may rotate a file while it is being inspected. Migration is best effort.
    }
  }
  return [...origins.entries()]
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
    .slice(-MAX_ORIGINS)
    .map(([origin]) => origin);
};

const listen = (server, port) => new Promise((resolve, reject) => {
  const onError = error => reject(error);
  server.once('error', onError);
  server.listen(port, '127.0.0.1', () => {
    server.off('error', onError);
    resolve();
  });
});

const close = server => new Promise(resolve => server.close(() => resolve()));

const readLegacyOrigin = async (BrowserWindow, origin) => {
  const port = Number(new URL(origin).port);
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'",
    });
    response.end('<!doctype html><meta charset="utf-8"><title>Storage migration</title>');
  });
  let window;
  try {
    await listen(server, port);
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    await window.loadURL(origin);
    return await window.webContents.executeJavaScript('Object.fromEntries(Object.entries(localStorage))');
  } catch {
    return {};
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    if (server.listening) await close(server);
  }
};

const boundStoragePayload = (items) => {
  const result = {};
  let totalBytes = 0;
  for (const [key, rawValue] of Object.entries(items || {})) {
    const value = String(rawValue ?? '');
    const bytes = Buffer.byteLength(key) + Buffer.byteLength(value);
    if (bytes > MAX_VALUE_BYTES || totalBytes + bytes > MAX_TOTAL_BYTES) continue;
    result[key] = value;
    totalBytes += bytes;
  }
  return result;
};

const migrateLegacyLocalStorage = async ({
  BrowserWindow,
  targetWindow,
  userDataDir,
  logger = () => {},
}) => {
  const markerPath = path.join(userDataDir, MIGRATION_MARKER);
  if (fs.existsSync(markerPath)) return { migrated: false, keys: 0, origins: 0 };

  const leveldbDir = path.join(userDataDir, 'Local Storage', 'leveldb');
  const origins = discoverLegacyRendererOrigins(leveldbDir);
  const merged = {};
  for (const origin of origins) {
    Object.assign(merged, boundStoragePayload(await readLegacyOrigin(BrowserWindow, origin)));
  }
  const payload = boundStoragePayload(merged);
  const entries = Object.entries(payload);
  if (entries.length) {
    await targetWindow.webContents.executeJavaScript(`
      for (const [key, value] of ${JSON.stringify(entries)}) localStorage.setItem(key, value);
    `);
  }
  fs.writeFileSync(markerPath, `${JSON.stringify({
    completedAt: new Date().toISOString(),
    origins: origins.length,
    keys: entries.length,
  }, null, 2)}\n`, 'utf8');
  logger(`renderer localStorage migration completed: origins=${origins.length} keys=${entries.length}`);
  return { migrated: entries.length > 0, keys: entries.length, origins: origins.length };
};

module.exports = {
  MIGRATION_MARKER,
  boundStoragePayload,
  discoverLegacyRendererOrigins,
  migrateLegacyLocalStorage,
};
