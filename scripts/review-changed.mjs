import { spawn } from 'node:child_process';
import process from 'node:process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', env: process.env });
  child.on('error', reject);
  child.on('exit', code => resolve(Number.isInteger(code) ? code : 1));
});

const verifyArgs = ['scripts/verify.mjs', 'changed', ...process.argv.slice(2)];
const verifyCode = await run(process.execPath, verifyArgs);
if (verifyCode !== 0) {
  process.stderr.write('\nReview stopped because verification failed. See test-results/verification/latest.md.\n');
  process.exitCode = verifyCode;
} else {
  process.stdout.write('\nVerification passed. Opening the development App; press Ctrl+C to stop it.\n');
  process.exitCode = await run(npmCommand, ['run', 'desktop:dev']);
}
