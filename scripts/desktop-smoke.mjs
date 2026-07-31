import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  createSmokeServers,
  getIsolatedSmokeEnvironment,
  resolveElectronExecutable,
} from './desktop-smoke-core.mjs';
import { processTreeSpawnOptions, terminateProcessTree } from './release/process-tree.mjs';
import { redactSecrets } from './verification/core.mjs';

const projectRoot = process.cwd();
const reportDir = path.join(projectRoot, 'test-results', 'desktop-smoke');
const tempHome = await mkdtemp(path.join(os.tmpdir(), 'seo-wp-desktop-smoke-'));
const servers = await createSmokeServers();
const started = Date.now();
let electron = null;
let output = '';

const waitForRenderer = (timeoutMs = 20000) => new Promise((resolve, reject) => {
  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (servers.rendererWasRequested()) {
      clearInterval(timer);
      resolve();
      return;
    }
    if (electron?.exitCode !== null) {
      clearInterval(timer);
      reject(new Error(`Electron exited before loading the renderer (code ${electron?.exitCode}).`));
      return;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      clearInterval(timer);
      reject(new Error('Electron did not request the smoke renderer within 20 seconds.'));
    }
  }, 100);
});

let result = 'failed';
let errorMessage = '';
try {
  const executable = resolveElectronExecutable(projectRoot, process.platform);
  electron = spawn(executable, ['.', `--user-data-dir=${path.join(tempHome, 'user-data')}`], {
    cwd: projectRoot,
    env: getIsolatedSmokeEnvironment(tempHome, servers),
    stdio: ['ignore', 'pipe', 'pipe'],
    ...processTreeSpawnOptions(process.platform),
  });
  electron.stdout.on('data', chunk => { output += chunk.toString(); });
  electron.stderr.on('data', chunk => { output += chunk.toString(); });
  electron.on('error', error => { output += `\n${error.stack || error.message}`; });
  await waitForRenderer();
  await new Promise(resolve => setTimeout(resolve, 500));
  if (electron.exitCode !== null) throw new Error(`Electron exited during the smoke window (code ${electron.exitCode}).`);
  result = 'passed';
} catch (error) {
  errorMessage = String(error?.message || error);
  process.exitCode = 1;
} finally {
  await terminateProcessTree(electron);
  await servers.close();
  await mkdir(reportDir, { recursive: true });
  const safeOutput = redactSecrets(output);
  await writeFile(path.join(reportDir, 'electron.log'), safeOutput, 'utf8');
  await writeFile(path.join(reportDir, 'latest.json'), `${JSON.stringify({
    schemaVersion: 1,
    result,
    durationMs: Date.now() - started,
    rendererRequested: servers.rendererWasRequested(),
    errorMessage,
    logPath: 'test-results/desktop-smoke/electron.log',
  }, null, 2)}\n`, 'utf8');
  await rm(tempHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

if (result === 'passed') {
  process.stdout.write(`[desktop-smoke] PASS: Electron loaded the isolated renderer in ${((Date.now() - started) / 1000).toFixed(2)}s.\n`);
} else {
  process.stderr.write(`[desktop-smoke] FAIL: ${errorMessage}\n`);
  process.stderr.write('[desktop-smoke] Evidence: test-results/desktop-smoke/latest.json\n');
}
