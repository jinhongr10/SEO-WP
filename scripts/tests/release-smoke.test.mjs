import assert from 'node:assert/strict';
import test from 'node:test';

import {
  READ_ONLY_ENDPOINTS,
  summarizeSmokeResponse,
} from '../release/read-only-smoke-core.mjs';
import { processTreeSpawnOptions, terminationTarget } from '../release/process-tree.mjs';

test('release smoke uses GET-only endpoints with no write routes', () => {
  assert.ok(READ_ONLY_ENDPOINTS.length >= 4);
  assert.ok(READ_ONLY_ENDPOINTS.every(endpoint => endpoint.method === 'GET'));
  assert.ok(READ_ONLY_ENDPOINTS.some(endpoint => endpoint.path === '/desktop/health'));
  assert.ok(READ_ONLY_ENDPOINTS.some(endpoint => endpoint.path === '/settings'));
  assert.ok(READ_ONLY_ENDPOINTS.some(endpoint => endpoint.path.includes('/system/network-status')));
  assert.doesNotMatch(READ_ONLY_ENDPOINTS.map(item => item.path).join('\n'), /upload|apply|publish|delete/i);
});

test('settings smoke summary reports configuration without returning credentials', () => {
  const summary = summarizeSmokeResponse('settings', {
    wpUrl: 'https://example.com',
    wpUser: 'admin',
    wpAppPass: 'secret-password',
    wcConsumerKey: 'ck_secret',
    wcConsumerSecret: 'cs_secret',
  });

  assert.deepEqual(summary, {
    configured: true,
    wordpressConfigured: true,
    woocommerceConfigured: true,
  });
  assert.doesNotMatch(JSON.stringify(summary), /secret-password|ck_secret|cs_secret/);
});

test('network smoke summary converts failed external checks into warnings', () => {
  const summary = summarizeSmokeResponse('network', {
    ok: false,
    summary: 'WordPress unavailable',
    checks: [
      { key: 'wordpress', ok: false, status: 'error', label: 'WordPress', detail: 'timeout' },
      { key: 'runtime', ok: true, status: 'ok', label: 'Backend', detail: 'ok' },
    ],
  });

  assert.equal(summary.ok, false);
  assert.deepEqual(summary.warnings, ['WordPress: timeout']);
});

test('temporary smoke backend owns a process group that can be terminated as a tree', () => {
  assert.deepEqual(processTreeSpawnOptions('darwin'), { detached: true });
  assert.deepEqual(processTreeSpawnOptions('linux'), { detached: true });
  assert.deepEqual(processTreeSpawnOptions('win32'), { detached: false });
  assert.equal(terminationTarget({ pid: 4321 }, 'darwin'), -4321);
  assert.equal(terminationTarget({ pid: 4321 }, 'linux'), -4321);
  assert.equal(terminationTarget({ pid: 4321 }, 'win32'), 4321);
});
