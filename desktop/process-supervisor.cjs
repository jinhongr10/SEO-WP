const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const waitForExit = (child, timeoutMs) => new Promise((resolve) => {
  if (!child || child.exitCode !== null || child.signalCode) {
    resolve(true);
    return;
  }
  let timer;
  const finish = (exited) => {
    clearTimeout(timer);
    child.off('exit', onExit);
    resolve(exited);
  };
  const onExit = () => finish(true);
  child.once('exit', onExit);
  timer = setTimeout(() => finish(false), timeoutMs);
});

const commandDiagnostics = (command) => {
  const absolute = path.isAbsolute(command);
  const exists = absolute ? fs.existsSync(command) : null;
  let accessible = null;
  if (exists) {
    try {
      fs.accessSync(command, fs.constants.R_OK | fs.constants.X_OK);
      accessible = true;
    } catch {
      accessible = false;
    }
  }
  return { absolute, exists, accessible };
};

const formatSpawnError = (error, command, logPath) => {
  const diagnostics = commandDiagnostics(command);
  const hints = [
    `Unable to start the desktop backend: ${command}`,
    `error.code=${String(error?.code || 'unknown')}`,
    `exists=${diagnostics.exists === null ? 'PATH lookup' : diagnostics.exists}`,
    `readable/executable=${diagnostics.accessible === null ? 'unknown' : diagnostics.accessible}`,
    `backend.log=${logPath}`,
  ];
  if (process.platform === 'win32') {
    hints.push('Check Windows Security > Protection history for a Defender quarantine event.');
  }
  const wrapped = new Error(hints.join('; '), { cause: error });
  wrapped.code = error?.code;
  return wrapped;
};

const spawnWithLog = async ({
  command,
  args,
  cwd,
  env,
  logPath,
  platform = process.platform,
}) => {
  const logFile = fs.openSync(logPath, 'a');
  let child;
  try {
    child = spawn(command, args, {
      cwd,
      env,
      detached: platform !== 'win32',
      stdio: ['ignore', logFile, logFile],
      windowsHide: true,
    });
  } finally {
    fs.closeSync(logFile);
  }

  return await new Promise((resolve, reject) => {
    const onSpawn = () => {
      child.off('error', onError);
      resolve(child);
    };
    const onError = (error) => {
      child.off('spawn', onSpawn);
      reject(formatSpawnError(error, command, logPath));
    };
    child.once('spawn', onSpawn);
    child.once('error', onError);
  });
};

const runTaskkill = (pid) => new Promise((resolve, reject) => {
  const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  killer.once('error', reject);
  killer.once('exit', code => {
    if (code === 0 || code === 128) resolve();
    else reject(new Error(`taskkill failed for PID ${pid} with exit code ${code}`));
  });
});

const terminateProcessTree = async (child, {
  platform = process.platform,
  gracefulTimeoutMs = 2_000,
  forceTimeoutMs = 5_000,
} = {}) => {
  if (!child?.pid || child.exitCode !== null || child.signalCode) return;

  if (platform === 'win32') {
    await runTaskkill(child.pid);
    await waitForExit(child, forceTimeoutMs);
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  if (await waitForExit(child, gracefulTimeoutMs)) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
  await waitForExit(child, forceTimeoutMs);
};

module.exports = {
  commandDiagnostics,
  formatSpawnError,
  spawnWithLog,
  terminateProcessTree,
  waitForExit,
};
