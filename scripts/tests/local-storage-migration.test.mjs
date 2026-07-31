import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  boundStoragePayload,
  discoverLegacyRendererOrigins,
} = require('../../desktop/local-storage-migration.cjs');

test('discovers legacy random renderer origins from Chromium LevelDB files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'seo-local-storage-'));
  try {
    await writeFile(
      path.join(directory, '000003.log'),
      Buffer.from('_http://127.0.0.1_43123\u0000http://127.0.0.1:49152'),
    );
    assert.deepEqual(discoverLegacyRendererOrigins(directory), [
      'http://127.0.0.1:43123',
      'http://127.0.0.1:49152',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('bounds migrated localStorage values and total payload size', () => {
  const payload = boundStoragePayload({
    theme: 'dark',
    oversized: 'x'.repeat(2 * 1024 * 1024 + 1),
  });
  assert.deepEqual(payload, { theme: 'dark' });
});
