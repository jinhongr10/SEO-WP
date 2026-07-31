import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  processTreeSpawnOptions,
  shouldRestartElectron,
  terminationTarget,
  waitForUrl,
} = require('../../desktop/dev-supervisor.cjs');

test('waitForUrl retries until the development service is healthy', async () => {
  let attempts = 0;
  const result = await waitForUrl('http://127.0.0.1:3004/desktop/health', {
    timeoutMs: 100,
    intervalMs: 1,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('connection refused');
      return { ok: true, status: 200 };
    },
  });

  assert.equal(result.status, 200);
  assert.equal(attempts, 3);
});

test('waitForUrl reports the service and last failure on timeout', async () => {
  await assert.rejects(
    () => waitForUrl('http://127.0.0.1:3999/health', {
      timeoutMs: 5,
      intervalMs: 1,
      fetchImpl: async () => { throw new Error('socket closed'); },
    }),
    /Timed out waiting for http:\/\/127\.0\.0\.1:3999\/health[\s\S]*socket closed/,
  );
});

test('Electron entry and native window shell changes require an Electron restart', () => {
  assert.equal(shouldRestartElectron('/repo/desktop/main.cjs'), true);
  assert.equal(shouldRestartElectron('/repo/desktop/preload.cjs'), true);
  assert.equal(shouldRestartElectron('C:\\repo\\desktop\\windows-shell.cjs'), true);
  assert.equal(shouldRestartElectron('/repo/App.tsx'), false);
  assert.equal(shouldRestartElectron('/repo/backend/main.py'), false);
});

test('development services are isolated into terminable process groups', () => {
  assert.deepEqual(processTreeSpawnOptions('darwin'), { detached: true });
  assert.deepEqual(processTreeSpawnOptions('linux'), { detached: true });
  assert.deepEqual(processTreeSpawnOptions('win32'), { detached: false });
  assert.equal(terminationTarget({ pid: 9876 }, 'darwin'), -9876);
  assert.equal(terminationTarget({ pid: 9876 }, 'linux'), -9876);
  assert.equal(terminationTarget({ pid: 9876 }, 'win32'), 9876);
});

test('desktop development runner waits for readiness and watches Electron entry files', async () => {
  const source = await readFile(new URL('../../desktop/dev-runner.cjs', import.meta.url), 'utf8');

  assert.match(source, /waitForUrl/);
  assert.match(source, /desktop\/health/);
  assert.match(source, /fs\.watch/);
  assert.match(source, /\['main\.cjs', 'preload\.cjs', 'local-storage-migration\.cjs', 'process-supervisor\.cjs', 'windows-shell\.cjs'\]/);
  assert.match(source, /dev-session/);
  assert.doesNotMatch(source, /setTimeout\(\(\)\s*=>\s*\{[\s\S]*1500/);
});
