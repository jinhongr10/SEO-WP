import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

import { createSmokeServers, getIsolatedSmokeEnvironment } from './desktop-smoke-core.mjs';
import { processTreeSpawnOptions, terminateProcessTree } from './release/process-tree.mjs';
import { redactSecrets } from './verification/core.mjs';

const valueAfter = flag => {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const hasFlag = flag => process.argv.slice(2).includes(flag);

const waitForProcessExit = (child, timeoutMs = 30_000) => new Promise((resolve, reject) => {
  if (!child || child.exitCode !== null) {
    resolve(child?.exitCode ?? 0);
    return;
  }
  const timer = setTimeout(() => {
    cleanup();
    reject(new Error(`Packaged application did not exit within ${timeoutMs}ms.`));
  }, timeoutMs);
  const onExit = code => {
    cleanup();
    resolve(code);
  };
  const cleanup = () => {
    clearTimeout(timer);
    child.off('exit', onExit);
  };
  child.once('exit', onExit);
});

const copyRedactedLog = async (source, destination) => {
  try {
    const content = await readFile(source, 'utf8');
    await writeFile(destination, redactSecrets(content), 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
};

const waitForDevToolsEndpoint = (child, timeoutMs = 30_000) => new Promise((resolve, reject) => {
  let output = '';
  let timer;
  const finish = (callback, value) => {
    clearTimeout(timer);
    child.stdout?.off('data', onData);
    child.stderr?.off('data', onData);
    child.off('error', onError);
    child.off('exit', onExit);
    callback(value);
  };
  const onData = chunk => {
    output += chunk.toString();
    const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) finish(resolve, match[1]);
  };
  const onError = error => finish(reject, error);
  const onExit = code => finish(reject, new Error(
    `Packaged application exited before DevTools was ready (code ${code}).\n${output.slice(-2000)}`,
  ));
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);
  child.once('error', onError);
  child.once('exit', onExit);
  timer = setTimeout(() => finish(reject, new Error(
    `Packaged application did not expose DevTools within ${timeoutMs}ms.\n${output.slice(-2000)}`,
  )), timeoutMs);
});

const executable = path.resolve(valueAfter('--executable'));
const reportDir = path.resolve(valueAfter('--evidence-dir') || 'test-results/packaged-desktop-smoke');
const realSidecar = hasFlag('--real-sidecar');
const requestedUserDataRoot = valueAfter('--user-data-root');
const ownsTempHome = !requestedUserDataRoot;
const tempHome = requestedUserDataRoot
  ? path.resolve(requestedUserDataRoot)
  : await mkdtemp(path.join(os.tmpdir(), 'seo-wp-packaged-smoke-'));
await mkdir(tempHome, { recursive: true });
const servers = await createSmokeServers();
const started = Date.now();
const rendererErrors = [];
const failedResponses = [];
let appProcess;
let browser;
let page;
let result = 'failed';
let failure = '';
let gracefulExit = false;
let healthBeforeRestart = null;
let healthAfterRestart = null;
let nativeSelfTest = null;
let taskSelfTest = null;
let electronOutput = '';

try {
  if (!valueAfter('--executable')) throw new Error('--executable is required.');
  await access(executable);
  const env = getIsolatedSmokeEnvironment(tempHome, servers, { realSidecar });
  delete env.VITE_DEV_SERVER_URL;
  delete env.NODE_OPTIONS;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.SEO_WP_SYNC_EXTERNAL_BACKEND_URL;
  env.SEO_WP_SYNC_RELEASE_SMOKE = '1';
  env.APPDATA = path.join(tempHome, 'appdata');
  env.LOCALAPPDATA = path.join(tempHome, 'local-appdata');

  appProcess = spawn(executable, [
    '--remote-debugging-port=0',
    `--user-data-dir=${path.join(tempHome, 'user-data')}`,
  ], {
    cwd: path.dirname(executable),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...processTreeSpawnOptions(process.platform),
  });
  const captureOutput = chunk => {
    electronOutput = `${electronOutput}${chunk.toString()}`.slice(-200_000);
  };
  appProcess.stdout?.on('data', captureOutput);
  appProcess.stderr?.on('data', captureOutput);
  const endpoint = await waitForDevToolsEndpoint(appProcess);
  browser = await chromium.connectOverCDP(endpoint, { timeout: 30_000 });
  const context = browser.contexts()[0];
  if (!context) throw new Error('Packaged application did not expose a Chromium browser context.');
  page = context.pages()[0] || await context.waitForEvent('page', { timeout: 30_000 });
  const onPageError = error => rendererErrors.push(`pageerror: ${error.message || error}`);
  const onConsole = message => {
    if (message.type() !== 'error') return;
    const location = message.location().url;
    rendererErrors.push(`console: ${message.text()}${location ? ` (${location})` : ''}`);
  };
  const onResponse = response => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('response', onResponse);

  await page.waitForLoadState('domcontentloaded');
  await page.locator('body').waitFor({ state: 'visible', timeout: 30_000 });
  const bodyText = await page.locator('body').innerText();
  assert.ok(bodyText.trim().length >= 20, 'Packaged renderer did not show meaningful application content.');
  assert.match(bodyText, /独立站 AI|连接你的站点|系统运营工作台/);

  if (realSidecar) {
    healthBeforeRestart = await page.evaluate(async () => {
      const response = await fetch('/api/desktop/health');
      return { status: response.status, body: await response.json() };
    });
    assert.equal(healthBeforeRestart.status, 200, 'Installed Python sidecar health check failed.');
    assert.equal(healthBeforeRestart.body?.ok, true, 'Installed Python sidecar did not report ready.');
    assert.ok(Number(healthBeforeRestart.body?.processId) > 0, 'Installed Python sidecar did not report its process ID.');
    assert.match(String(healthBeforeRestart.body?.nodeCli?.path || ''), /resources[\\/]dist-cli[\\/]cli\.js$/i);
    assert.match(
      String(healthBeforeRestart.body?.nodeCli?.runtime || ''),
      /resources[\\/]node-runtime[\\/]node\.exe$/i,
      'Backend did not select the packaged Node runtime.',
    );

    nativeSelfTest = await page.evaluate(async () => {
      const response = await fetch('/api/desktop/native-self-test', { method: 'POST' });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(nativeSelfTest.status, 200, JSON.stringify(nativeSelfTest.body));
    assert.equal(nativeSelfTest.body?.ok, true, 'Installed Node/SQLite/Sharp self-test failed.');
    assert.match(String(nativeSelfTest.body?.nodeExecutable || ''), /resources[\\/]node-runtime[\\/]node\.exe$/i);
    assert.equal(nativeSelfTest.body?.sqlite?.integrity, 'ok', 'SQLite integrity_check failed.');
    assert.equal(nativeSelfTest.body?.sqlite?.deletedRows, 1, 'SQLite delete self-test failed.');
    assert.equal(nativeSelfTest.body?.sqlite?.remainingRows, 0, 'SQLite row remained after delete.');
    assert.equal(nativeSelfTest.body?.sharp?.input?.format, 'png', 'Sharp did not read the test input image.');
    assert.equal(nativeSelfTest.body?.sharp?.output?.format, 'webp', 'Sharp did not write the test output image.');

    taskSelfTest = await page.evaluate(async () => {
      const startResponse = await fetch('/api/desktop/background-task-self-test/start', { method: 'POST' });
      const startBody = await startResponse.json();
      if (!startResponse.ok) return { startStatus: startResponse.status, startBody };
      const cancelResponse = await fetch(
        `/api/desktop/background-task-self-test/${encodeURIComponent(startBody.task.id)}/cancel`,
        { method: 'POST' },
      );
      return {
        startStatus: startResponse.status,
        startBody,
        cancelStatus: cancelResponse.status,
        cancelBody: await cancelResponse.json(),
      };
    });
    assert.equal(taskSelfTest.startStatus, 200, JSON.stringify(taskSelfTest.startBody));
    assert.match(String(taskSelfTest.startBody?.task?.status || ''), /^(queued|running)$/);
    assert.equal(taskSelfTest.cancelStatus, 200, JSON.stringify(taskSelfTest.cancelBody));
    assert.equal(taskSelfTest.cancelBody?.task?.status, 'cancelled');

    const restartResult = await page.evaluate(async () => {
      const backendUrl = await window.seoWpSyncDesktop.restartBackend();
      const response = await fetch('/api/desktop/health');
      return { backendUrl, status: response.status, body: await response.json() };
    });
    healthAfterRestart = restartResult;
    assert.equal(restartResult.status, 200, 'Python sidecar health check failed after restart.');
    assert.equal(restartResult.body?.ok, true, 'Python sidecar did not recover after restart.');
    assert.notEqual(
      restartResult.body?.processId,
      healthBeforeRestart.body?.processId,
      'Backend restart reused the previous Python process.',
    );
  }

  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    outerWidth: window.outerWidth,
    availableWidth: window.screen.availWidth,
  }));
  const expectedMinimumOuterWidth = Math.min(1100, metrics.availableWidth);
  assert.ok(
    metrics.outerWidth >= expectedMinimumOuterWidth - 16,
    `Packaged outer window width ${metrics.outerWidth}px is below the ${expectedMinimumOuterWidth}px minimum available on this display.`,
  );
  assert.ok(metrics.innerWidth >= 900, `Packaged renderer width ${metrics.innerWidth}px is too narrow for desktop smoke testing.`);

  const browseButton = page.getByRole('button', { name: '直接进入工作台' });
  if (await browseButton.isVisible().catch(() => false)) {
    await browseButton.click();
    await page.getByRole('button', { name: '设置' }).waitFor({ state: 'visible', timeout: 15_000 });
  }
  await new Promise(resolve => setTimeout(resolve, 1_000));
  const unhandledBackendRequests = servers.unhandledBackendRequests();
  assert.deepEqual(rendererErrors, [], `Packaged startup renderer errors:\n${rendererErrors.join('\n')}`);
  assert.deepEqual(failedResponses, [], `Packaged startup HTTP errors:\n${failedResponses.join('\n')}`);
  assert.deepEqual(
    unhandledBackendRequests,
    [],
    `Packaged startup unhandled backend requests:\n${unhandledBackendRequests.join('\n')}`,
  );
  page.off('pageerror', onPageError);
  page.off('console', onConsole);
  page.off('response', onResponse);

  await mkdir(reportDir, { recursive: true });
  await page.screenshot({ path: path.join(reportDir, 'packaged-app.png'), fullPage: false });
  await page.close();
  page = null;
  await waitForProcessExit(appProcess);
  gracefulExit = true;
  result = 'passed';
} catch (error) {
  failure = String(error?.stack || error?.message || error);
  process.exitCode = 1;
} finally {
  await mkdir(reportDir, { recursive: true });
  if (page && result !== 'passed') {
    await page.screenshot({ path: path.join(reportDir, 'packaged-app-failure.png'), fullPage: false }).catch(() => {});
  }
  await browser?.close().catch(() => {});
  if (!gracefulExit) await terminateProcessTree(appProcess);
  await servers.close();
  const logsDir = healthAfterRestart?.body?.paths?.logsDir
    || healthBeforeRestart?.body?.paths?.logsDir
    || path.join(tempHome, 'user-data', 'logs');
  await copyRedactedLog(path.join(logsDir, 'backend-launch.log'), path.join(reportDir, 'backend-launch.log'));
  await copyRedactedLog(path.join(logsDir, 'backend.log'), path.join(reportDir, 'backend.log'));
  await writeFile(path.join(reportDir, 'electron.log'), redactSecrets(electronOutput), 'utf8');
  await writeFile(path.join(reportDir, 'latest.json'), `${JSON.stringify({
    schemaVersion: 1,
    result,
    executable,
    durationMs: Date.now() - started,
    rendererErrors: rendererErrors.map(redactSecrets),
    failedResponses: failedResponses.map(redactSecrets),
    unhandledBackendRequests: servers.unhandledBackendRequests().map(redactSecrets),
    realSidecar,
    gracefulExit,
    healthBeforeRestart,
    healthAfterRestart,
    nativeSelfTest,
    taskSelfTest,
    userDataRoot: tempHome,
    failure: redactSecrets(failure),
  }, null, 2)}\n`, 'utf8');
  if (ownsTempHome) {
    await rm(tempHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (result === 'passed') {
  process.stdout.write(`[packaged-desktop-smoke] PASS: installed UI rendered and browse mode opened in ${((Date.now() - started) / 1000).toFixed(2)}s.\n`);
} else {
  process.stderr.write(`[packaged-desktop-smoke] FAIL: ${failure}\n`);
}
