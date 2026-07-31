const { spawn } = require('child_process');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let shuttingDown = false;

const spawnNpmScript = (label, script, env = {}) => {
  const child = spawn(npmCmd, ['run', script], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`);
      process.exitCode = code;
    } else if (signal) {
      console.error(`${label} exited with signal ${signal}`);
      process.exitCode = 1;
    }
    shutdown();
  });
  return child;
};

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  while (children.length) {
    const child = children.pop();
    if (!child.killed && child.exitCode === null) child.kill('SIGTERM');
  }
};

process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(143);
});

spawnNpmScript('backend', 'dev:backend');
spawnNpmScript('frontend', 'dev:frontend');
