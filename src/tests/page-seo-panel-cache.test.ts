import assert from 'node:assert/strict';
import test from 'node:test';

import type { PageSeoItem } from '../../services/pageSeoService.ts';
import {
  buildPageSeoCacheKey,
  clearPageSeoPanelCache,
  clearPageSeoPanelCachesForSite,
  formatPageSeoCacheAge,
  loadPageSeoPanelCache,
  PAGE_SEO_PANEL_CACHE_PREFIX,
  PAGE_SEO_PANEL_LEGACY_SESSION_PREFIX,
  resetPageSeoPanelCacheMemoryForTests,
  savePageSeoPanelCache,
} from '../pageSeoPanelCache.ts';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const samplePage: PageSeoItem = {
  id: 9321,
  source: 'pages',
  title: 'Product Sample Guide',
  slug: 'product-sample-guide',
  link: 'https://example.com/product-sample-guide/',
  status: 'publish',
  modified: '2026-06-18T10:00:00',
  currentSeoTitle: 'Product Sample Guide',
  currentMetaDescription: 'Existing page SEO description',
  contentPreview: 'Useful buying guidance for deployment site product samples.',
};

test('page SEO scan results persist in localStorage across panel sessions', () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const cacheKey = buildPageSeoCacheKey('/api', 'pages', 'publish', '');

  savePageSeoPanelCache({ localStorage, sessionStorage }, cacheKey, {
    items: [samplePage],
    warnings: ['AIOSEO endpoint was slow'],
    savedAt: 1781798400000,
  });
  resetPageSeoPanelCacheMemoryForTests();

  const restored = loadPageSeoPanelCache({ localStorage, sessionStorage }, cacheKey);

  assert.equal(localStorage.getItem(`${PAGE_SEO_PANEL_CACHE_PREFIX}${cacheKey}`)?.includes('Product Sample Guide'), true);
  assert.equal(restored?.items.length, 1);
  assert.equal(restored?.items[0].id, 9321);
  assert.deepEqual(restored?.warnings, ['AIOSEO endpoint was slow']);
});

test('page SEO cache can be cleared for the active source and filters', () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const cacheKey = buildPageSeoCacheKey('/api', 'pages', 'publish', 'sample');

  savePageSeoPanelCache({ localStorage, sessionStorage }, cacheKey, {
    items: [samplePage],
    warnings: [],
    savedAt: 1781798400000,
  });
  sessionStorage.setItem(`${PAGE_SEO_PANEL_LEGACY_SESSION_PREFIX}${cacheKey}`, JSON.stringify({
    items: [samplePage],
    warnings: [],
    savedAt: 1781798300000,
  }));

  clearPageSeoPanelCache({ localStorage, sessionStorage }, cacheKey);
  resetPageSeoPanelCacheMemoryForTests();

  assert.equal(localStorage.getItem(`${PAGE_SEO_PANEL_CACHE_PREFIX}${cacheKey}`), null);
  assert.equal(sessionStorage.getItem(`${PAGE_SEO_PANEL_LEGACY_SESSION_PREFIX}${cacheKey}`), null);
  assert.equal(loadPageSeoPanelCache({ localStorage, sessionStorage }, cacheKey), null);
});

test('page SEO cache age is formatted for dashboard notices', () => {
  const now = 1781798400000;

  assert.equal(formatPageSeoCacheAge(now - 15_000, now), '刚刚');
  assert.equal(formatPageSeoCacheAge(now - 5 * 60_000, now), '5 分钟前');
  assert.equal(formatPageSeoCacheAge(now - 3 * 60 * 60_000, now), '3 小时前');
  assert.equal(formatPageSeoCacheAge(now - 2 * 24 * 60 * 60_000, now), '2 天前');
});

test('page SEO cache keys and deletion cleanup are isolated by site', () => {
  resetPageSeoPanelCacheMemoryForTests();
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const siteAKey = buildPageSeoCacheKey('/api', 'pages', 'publish', '', 'site-a');
  const siteBKey = buildPageSeoCacheKey('/api', 'pages', 'publish', '', 'site-b');
  const entry = { items: [samplePage], warnings: [], savedAt: 10_000 };
  savePageSeoPanelCache({ localStorage, sessionStorage }, siteAKey, entry);
  savePageSeoPanelCache({ localStorage, sessionStorage }, siteBKey, entry);

  clearPageSeoPanelCachesForSite({ localStorage, sessionStorage }, 'site-a');

  assert.equal(loadPageSeoPanelCache({ localStorage, sessionStorage }, siteAKey), null);
  assert.deepEqual(loadPageSeoPanelCache({ localStorage, sessionStorage }, siteBKey), entry);
});
