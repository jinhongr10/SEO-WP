import { spawn } from 'node:child_process';
import process from 'node:process';

export const processTreeSpawnOptions = platform => ({ detached: platform !== 'win32' });

export const terminationTarget = (child, platform) => (
  platform === 'win32' ? child.pid : -child.pid
);

const waitForExit = (child, timeoutMs) => new Promise(resolve => {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    resolve(true);
    return;
  }
  let timer;
  const finish = exited => {
    clearTimeout(timer);
    child.off('exit', onExit);
    resolve(exited);
  };
  const onExit = () => finish(true);
  child.once('exit', onExit);
  timer = setTimeout(() => finish(false), timeoutMs);
  timer.unref?.();
});

const runTaskkill = child => new Promise(resolve => {
  const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  killer.once('error', () => resolve());
  killer.once('exit', () => resolve());
});

export const terminateProcessTree = async (
  child,
  { platform = process.platform, graceMs = 5000 } = {},
) => {
  if (!child || child.pid == null || child.exitCode !== null || child.signalCode !== null) return;
  if (platform === 'win32') {
    await runTaskkill(child);
    await waitForExit(child, graceMs);
    return;
  }

  const target = terminationTarget(child, platform);
  try {
    process.kill(target, 'SIGTERM');
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
  if (await waitForExit(child, graceMs)) return;
  try {
    process.kill(target, 'SIGKILL');
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
  await waitForExit(child, 1000);
};
