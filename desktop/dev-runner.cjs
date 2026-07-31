const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  processTreeSpawnOptions,
  shouldRestartElectron,
  terminateProcessTree,
  waitForUrl,
} = require('./dev-supervisor.cjs');

const projectRoot = path.resolve(__dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const devBackendUrl = 'http://127.0.0.1:3004';
const devFrontendUrl = 'http://127.0.0.1:3003';
const logDir = path.join(projectRoot, 'test-results', 'dev-session');
const logPath = path.join(logDir, 'latest.log');

fs.mkdirSync(logDir, { recursive: true });
const logStream = fs.createWriteStream(logPath, { flags: 'w' });
const recentLines = [];
const children = new Set();
const watchers = [];
let electronChild = null;
let shuttingDown = false;
let restartPending = false;
let restartTimer = null;

const record = (label, value) => {
  const text = String(value || '');
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const rendered = `[${new Date().toISOString()}] [${label}] ${line}`;
    recentLines.push(rendered);
    if (recentLines.length > 200) recentLines.shift();
    process.stdout.write(`${rendered}\n`);
    logStream.write(`${rendered}\n`);
  }
};

const printFailureSummary = (label, code, signal) => {
  record('supervisor', `${label} stopped unexpectedly (code=${code ?? ''}, signal=${signal ?? ''}).`);
  process.stderr.write('\nDevelopment session failure summary:\n');
  process.stderr.write(`${recentLines.slice(-40).join('\n')}\n`);
  process.stderr.write(`Full log: ${path.relative(projectRoot, logPath)}\n`);
};

const attachOutput = (child, label) => {
  child.stdout?.on('data', chunk => record(label, chunk));
  child.stderr?.on('data', chunk => record(label, chunk));
};

const spawnChild = (label, command, args, env = {}) => {
  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    ...processTreeSpawnOptions(process.platform),
  });
  children.add(child);
  attachOutput(child, label);
  child.on('error', error => record(label, error.stack || error.message));
  child.on('exit', () => children.delete(child));
  return child;
};

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (restartTimer) clearTimeout(restartTimer);
  while (watchers.length) watchers.pop().close();
  for (const child of children) {
    terminateProcessTree(child);
  }
  logStream.end();
};

const launchElectron = () => {
  if (shuttingDown) return;
  record('supervisor', 'Launching Electron development App.');
  const child = spawnChild('electron', npxCmd, ['electron', '.'], {
    VITE_DEV_SERVER_URL: devFrontendUrl,
    SEO_WP_SYNC_EXTERNAL_BACKEND_URL: devBackendUrl,
  });
  electronChild = child;
  child.on('exit', (code, signal) => {
    if (electronChild === child) electronChild = null;
    if (shuttingDown) return;
    if (restartPending) {
      restartPending = false;
      launchElectron();
      return;
    }
    printFailureSummary('Electron', code, signal);
    process.exitCode = code || 1;
    shutdown();
  });
};

const restartElectron = (changedPath) => {
  if (shuttingDown || !shouldRestartElectron(changedPath)) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    record('supervisor', `${path.relative(projectRoot, changedPath)} changed; restarting Electron only.`);
    if (!electronChild || electronChild.exitCode !== null) {
      launchElectron();
      return;
    }
    restartPending = true;
    terminateProcessTree(electronChild);
  }, 250);
};

const watchElectronEntries = () => {
  for (const filename of ['main.cjs', 'preload.cjs', 'local-storage-migration.cjs', 'process-supervisor.cjs', 'windows-shell.cjs']) {
    const fullPath = path.join(__dirname, filename);
    watchers.push(fs.watch(fullPath, () => restartElectron(fullPath)));
  }
};

const superviseService = (label, child) => {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    printFailureSummary(label, code, signal);
    process.exitCode = code || 1;
    shutdown();
  });
};

const main = async () => {
  record('supervisor', 'Starting backend and frontend development services.');
  const backend = spawnChild('backend', npmCmd, ['run', 'dev:backend']);
  const frontend = spawnChild('frontend', npmCmd, ['run', 'dev:frontend']);
  superviseService('Backend', backend);
  superviseService('Frontend', frontend);

  await Promise.all([
    waitForUrl(`${devBackendUrl}/desktop/health`),
    waitForUrl(devFrontendUrl),
  ]);
  record('supervisor', 'Frontend and backend are ready.');
  watchElectronEntries();
  launchElectron();
};

process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(143);
});

main().catch(error => {
  record('supervisor', error.stack || error.message || error);
  printFailureSummary('Startup', 1, '');
  process.exitCode = 1;
  shutdown();
});
