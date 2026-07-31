import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  createSmokeServers,
  getIsolatedSmokeEnvironment,
  resolveElectronExecutable,
} from '../desktop-smoke-core.mjs';

test('desktop smoke servers expose backend health and a renderer page', async () => {
  const servers = await createSmokeServers();
  try {
    const health = await fetch(`${servers.backendUrl}/desktop/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, smoke: true });

    const renderer = await fetch(servers.rendererUrl);
    assert.equal(renderer.status, 200);
    assert.match(await renderer.text(), /Desktop smoke ready/);
    assert.equal(servers.rendererWasRequested(), true);

    const knowledge = await fetch(`${servers.backendUrl}/knowledge/sources`);
    assert.deepEqual(await knowledge.json(), { ok: true, sources: [] });

    const profiles = await fetch(`${servers.backendUrl}/site-profiles`);
    assert.deepEqual(await profiles.json(), { company: { name: '' }, activeSiteId: '', sites: [] });

    const network = await fetch(`${servers.backendUrl}/system/network-status?prefer_cached=true`);
    assert.equal((await network.json()).problemArea, 'none');

    const seoHealth = await fetch(`${servers.backendUrl}/seo-health/summary?prefer_cached=true`);
    assert.equal(seoHealth.status, 200);
    assert.deepEqual(await seoHealth.json(), {
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
    });

    const gapStatus = await fetch(`${servers.backendUrl}/seo-gaps/cache-status`);
    assert.deepEqual(await gapStatus.json(), {
      media: { hasCache: false, total: 0, latestUpdatedAt: '', oldestUpdatedAt: '' },
      product: { hasCache: false, total: 0, latestLastScannedAt: '', oldestLastScannedAt: '' },
      task: { isRunning: false, operation: null, lastError: null },
    });

    const gapSearch = await fetch(`${servers.backendUrl}/seo-gaps/search?type=all&limit=20`);
    assert.deepEqual(await gapSearch.json(), { items: [], total: 0, limit: 20, offset: 0 });

    const [tasks, failedTasks, currentRun, schedule] = await Promise.all([
      fetch(`${servers.backendUrl}/daily-seo/tasks?limit=100`).then(response => response.json()),
      fetch(`${servers.backendUrl}/daily-seo/tasks?status=failed&limit=50`).then(response => response.json()),
      fetch(`${servers.backendUrl}/daily-seo/runs/current`).then(response => response.json()),
      fetch(`${servers.backendUrl}/daily-seo/settings`).then(response => response.json()),
    ]);
    assert.deepEqual(tasks, { items: [], total: 0 });
    assert.deepEqual(failedTasks, { items: [], total: 0 });
    assert.equal(currentRun, null);
    assert.deepEqual(schedule, {
      enabled: false,
      time: '02:00',
      timezone: 'UTC',
      lastRunDate: '',
      lastRunId: '',
      nextRunAt: '',
    });
    assert.deepEqual(servers.unhandledBackendRequests(), []);

    const unknown = await fetch(`${servers.backendUrl}/unexpected-smoke-request`);
    assert.equal(unknown.status, 404);
    assert.deepEqual(servers.unhandledBackendRequests(), ['GET /unexpected-smoke-request']);
  } finally {
    await servers.close();
  }
});

test('desktop smoke uses isolated data and external mock services', () => {
  const env = getIsolatedSmokeEnvironment('/tmp/desktop-smoke-home', {
    backendUrl: 'http://127.0.0.1:41001',
    rendererUrl: 'http://127.0.0.1:41002',
  });

  assert.equal(env.HOME, '/tmp/desktop-smoke-home');
  assert.equal(env.SEO_WP_SYNC_EXTERNAL_BACKEND_URL, 'http://127.0.0.1:41001');
  assert.equal(env.VITE_DEV_SERVER_URL, 'http://127.0.0.1:41002');
  assert.equal(env.SEO_WP_SYNC_LOAD_PROJECT_DOTENV, 'false');
});

test('desktop smoke resolves the installed Electron executable', async () => {
  const executable = resolveElectronExecutable(process.cwd(), process.platform);
  assert.match(executable, /electron/i);
  await access(executable);
});

test('desktop smoke accepts an explicit packaged executable', () => {
  const explicit = process.platform === 'win32'
    ? 'C:\\Temp\\独立站 AI.exe'
    : '/tmp/Independent Site AI';
  assert.equal(resolveElectronExecutable(process.cwd(), process.platform, explicit), explicit);
});

test('desktop smoke CLI records renderer startup evidence', async () => {
  const source = await readFile(new URL('../desktop-smoke.mjs', import.meta.url), 'utf8');
  assert.match(source, /rendererWasRequested/);
  assert.match(source, /test-results[\\/',\s]+desktop-smoke/);
  assert.match(source, /latest\.json/);
  assert.match(source, /terminateProcessTree\(electron\)/);
  assert.match(source, /await rm\(tempHome, \{ recursive: true, force: true, maxRetries: 5, retryDelay: 200 \}\)/);
});

test('packaged desktop smoke captures rendered UI evidence and exercises browse mode', async () => {
  const source = await readFile(new URL('../packaged-desktop-smoke.mjs', import.meta.url), 'utf8');
  assert.match(source, /chromium\.connectOverCDP/);
  assert.match(source, /--remote-debugging-port=0/);
  assert.match(source, /terminateProcessTree\(appProcess\)/);
  assert.doesNotMatch(source, /_electron\.launch/);
  assert.match(source, /直接进入工作台/);
  assert.match(source, /screenshot/);
  assert.match(source, /pageerror/);
  assert.match(source, /innerWidth/);
  assert.match(source, /screen\.availWidth/);
  assert.match(source, /Math\.min\(1100, metrics\.availableWidth\)/);
  assert.match(source, /page\.on\('response'/);
  assert.match(source, /failedResponses/);
  assert.match(source, /unhandledBackendRequests/);
  assert.match(source, /desktop\/native-self-test/);
  assert.match(source, /background-task-self-test\/start/);
  assert.match(source, /seoWpSyncDesktop\.restartBackend/);
  assert.match(source, /sqlite\?\.integrity/);
  assert.match(source, /node-runtime\[\\\\\/\]node\\\.exe/);
  assert.match(source, /await page\.close\(\)/);
  assert.match(source, /gracefulExit/);
  assert.match(source, /backend-launch\.log/);
  assert.match(source, /electron\.log/);
});

test('production renderer declares an inline favicon without another packaged request', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,/);
});
