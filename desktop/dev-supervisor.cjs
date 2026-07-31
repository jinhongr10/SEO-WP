const { spawn } = require('child_process');
const path = require('path');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const waitForUrl = async (url, {
  timeoutMs = 120000,
  intervalMs = 250,
  fetchImpl = globalThis.fetch,
} = {}) => {
  const started = Date.now();
  let lastError = null;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetchImpl(url);
      if (response?.ok) return response;
      lastError = new Error(`HTTP ${response?.status ?? 'unknown'}`);
    } catch (error) {
      lastError = error;
    }
    await delay(Math.min(intervalMs, Math.max(0, timeoutMs - (Date.now() - started))));
  }

  throw new Error(`Timed out waiting for ${url}. Last failure: ${lastError?.message || 'no response'}`);
};

const shouldRestartElectron = filePath => {
  const normalized = String(filePath || '').replaceAll('\\', '/');
  return normalized.endsWith('/desktop/main.cjs')
    || normalized.endsWith('/desktop/preload.cjs')
    || normalized.endsWith('/desktop/local-storage-migration.cjs')
    || normalized.endsWith('/desktop/process-supervisor.cjs')
    || normalized.endsWith('/desktop/windows-shell.cjs');
};

const processTreeSpawnOptions = platform => ({ detached: platform !== 'win32' });

const terminationTarget = (child, platform) => (
  platform === 'win32' ? child.pid : -child.pid
);

const terminateProcessTree = (child, signal = 'SIGTERM', platform = process.platform) => {
  if (!child || child.pid == null || child.exitCode !== null || child.signalCode !== null) return;
  if (platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  }
  try {
    process.kill(terminationTarget(child, platform), signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
};

module.exports = {
  processTreeSpawnOptions,
  shouldRestartElectron,
  terminateProcessTree,
  terminationTarget,
  waitForUrl,
};
