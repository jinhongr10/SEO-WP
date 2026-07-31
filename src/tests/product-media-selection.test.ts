import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRODUCT_MEDIA_SELECTOR_DEFAULT_STATUS,
  buildProductMediaListPath,
  formatMediaReferenceUrls,
  parseMediaReferenceUrls,
  refreshProductMediaLibrarySelection,
  toggleMediaReferenceUrl,
} from '../productMediaSelection';

test('parseMediaReferenceUrls accepts CSV, newlines, and JSON arrays', () => {
  assert.deepEqual(parseMediaReferenceUrls('https://a.test/one.webp, https://a.test/two.webp\nhttps://a.test/one.webp'), [
    'https://a.test/one.webp',
    'https://a.test/two.webp',
  ]);

  assert.deepEqual(parseMediaReferenceUrls('["https://a.test/three.webp", "https://a.test/four.webp"]'), [
    'https://a.test/three.webp',
    'https://a.test/four.webp',
  ]);
});

test('toggleMediaReferenceUrl adds and removes URLs while preserving order', () => {
  const first = ['https://a.test/one.webp'];
  assert.deepEqual(toggleMediaReferenceUrl(first, 'https://a.test/two.webp'), [
    'https://a.test/one.webp',
    'https://a.test/two.webp',
  ]);
  assert.deepEqual(toggleMediaReferenceUrl(first, 'https://a.test/one.webp'), []);
});

test('formatMediaReferenceUrls stores selected media URLs one per line', () => {
  assert.equal(
    formatMediaReferenceUrls(['https://a.test/one.webp', '', 'https://a.test/two.webp']),
    'https://a.test/one.webp\nhttps://a.test/two.webp',
  );
});

test('buildProductMediaListPath includes search, status, and issue filters', () => {
  const path = buildProductMediaListPath({
    page: 2,
    limit: 24,
    search: 'product sample',
    status: 'updated,optimized',
    issue: 'alt_text_missing',
  });

  assert.equal(path, '/media/list?page=2&limit=24&sort=id_desc&q=product+sample&status=updated%2Coptimized&issue=alt_text_missing');
});

test('product media selector defaults to all media so newly scanned images are visible', () => {
  assert.equal(PRODUCT_MEDIA_SELECTOR_DEFAULT_STATUS, '');
});

test('product media selector refresh scans latest WordPress media before reloading local list', async () => {
  const calls: string[] = [];

  await refreshProductMediaLibrarySelection({
    scanLimit: 48,
    startScan: async limit => {
      calls.push(`scan:${limit}`);
    },
    waitForScanIdle: async () => {
      calls.push('wait');
      return '';
    },
    fetchItems: async () => {
      calls.push('fetch');
    },
  });

  assert.deepEqual(calls, ['scan:48', 'wait', 'fetch']);
});
