import type { PageSeoItem, PageSeoSource } from '../services/pageSeoService';

export const PAGE_SEO_PANEL_CACHE_PREFIX = 'pageSeoPanelCache:v2:';
export const PAGE_SEO_PANEL_LEGACY_SESSION_PREFIX = 'pageSeoPanelCache:v1:';

type PageSeoPanelCacheStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> & Partial<Pick<Storage, 'key' | 'length'>>;

export interface PageSeoPanelCacheTargets {
  localStorage?: PageSeoPanelCacheStorage;
  sessionStorage?: PageSeoPanelCacheStorage;
}

export interface PageSeoPanelCacheEntry {
  items: PageSeoItem[];
  warnings: string[];
  savedAt: number;
}

interface StoredPageSeoPanelCache {
  version?: 2;
  items?: unknown;
  warnings?: unknown;
  savedAt?: unknown;
}

const pageSeoPanelMemoryCache = new Map<string, PageSeoPanelCacheEntry>();

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const cleanString = (value: unknown) => (
  typeof value === 'string' ? value : ''
);

const cleanSource = (value: unknown): PageSeoSource => (
  value === 'product_categories' ? 'product_categories' : 'pages'
);

const normalizeWarnings = (value: unknown) => (
  Array.isArray(value) ? value.map(cleanString).filter(Boolean) : []
);

const normalizePageSeoItem = (value: unknown): PageSeoItem | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!isFiniteNumber(row.id) || row.id <= 0) return null;
  const title = cleanString(row.title);
  if (!title) return null;

  return {
    id: row.id,
    source: cleanSource(row.source),
    title,
    slug: cleanString(row.slug),
    link: cleanString(row.link),
    status: cleanString(row.status) || 'publish',
    modified: cleanString(row.modified),
    currentSeoTitle: cleanString(row.currentSeoTitle),
    currentMetaDescription: cleanString(row.currentMetaDescription),
    contentPreview: cleanString(row.contentPreview),
  };
};

const normalizePageSeoPanelCache = (
  value: unknown,
  allowLegacyVersion = false,
): PageSeoPanelCacheEntry | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const parsed = value as StoredPageSeoPanelCache;
  if (!allowLegacyVersion && parsed.version !== 2) return null;
  if (!isFiniteNumber(parsed.savedAt)) return null;
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map(normalizePageSeoItem)
    .filter((item): item is PageSeoItem => Boolean(item));
  if (!items.length) return null;
  return {
    items,
    warnings: normalizeWarnings(parsed.warnings),
    savedAt: parsed.savedAt,
  };
};

const storageGet = (storage: PageSeoPanelCacheStorage | undefined, key: string) => {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const storageSet = (storage: PageSeoPanelCacheStorage | undefined, key: string, value: string) => {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const storageRemove = (storage: PageSeoPanelCacheStorage | undefined, key: string) => {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage access failures; the in-memory cache is cleared separately.
  }
};

const parseStoredCache = (
  raw: string | null,
  allowLegacyVersion = false,
) => {
  if (!raw) return null;
  try {
    return normalizePageSeoPanelCache(JSON.parse(raw), allowLegacyVersion);
  } catch {
    return null;
  }
};

export const buildPageSeoCacheKey = (
  apiBase: string,
  source: PageSeoSource,
  status: string,
  search: string,
  siteId = '',
) => [
  siteId.trim(),
  apiBase,
  source,
  source === 'pages' ? status || 'publish' : '',
  search.trim(),
].join('|');

export const savePageSeoPanelCache = (
  targets: PageSeoPanelCacheTargets,
  cacheKey: string,
  entry: PageSeoPanelCacheEntry,
) => {
  pageSeoPanelMemoryCache.set(cacheKey, entry);
  const stored = JSON.stringify({
    version: 2,
    items: entry.items,
    warnings: entry.warnings,
    savedAt: entry.savedAt,
  });
  const key = `${PAGE_SEO_PANEL_CACHE_PREFIX}${cacheKey}`;
  if (!storageSet(targets.localStorage, key, stored)) {
    storageSet(targets.sessionStorage, key, stored);
  }
};

export const loadPageSeoPanelCache = (
  targets: PageSeoPanelCacheTargets,
  cacheKey: string,
): PageSeoPanelCacheEntry | null => {
  const memoryEntry = pageSeoPanelMemoryCache.get(cacheKey);
  if (memoryEntry) return memoryEntry;

  const key = `${PAGE_SEO_PANEL_CACHE_PREFIX}${cacheKey}`;
  const localEntry = parseStoredCache(storageGet(targets.localStorage, key));
  if (localEntry) {
    pageSeoPanelMemoryCache.set(cacheKey, localEntry);
    return localEntry;
  }

  const sessionEntry = parseStoredCache(storageGet(targets.sessionStorage, key));
  if (sessionEntry) {
    pageSeoPanelMemoryCache.set(cacheKey, sessionEntry);
    return sessionEntry;
  }

  const legacyKey = `${PAGE_SEO_PANEL_LEGACY_SESSION_PREFIX}${cacheKey}`;
  const legacyEntry = parseStoredCache(storageGet(targets.sessionStorage, legacyKey), true);
  if (legacyEntry) {
    savePageSeoPanelCache(targets, cacheKey, legacyEntry);
    return legacyEntry;
  }

  return null;
};

export const clearPageSeoPanelCache = (
  targets: PageSeoPanelCacheTargets,
  cacheKey: string,
) => {
  pageSeoPanelMemoryCache.delete(cacheKey);
  const currentKey = `${PAGE_SEO_PANEL_CACHE_PREFIX}${cacheKey}`;
  const legacyKey = `${PAGE_SEO_PANEL_LEGACY_SESSION_PREFIX}${cacheKey}`;
  storageRemove(targets.localStorage, currentKey);
  storageRemove(targets.sessionStorage, currentKey);
  storageRemove(targets.localStorage, legacyKey);
  storageRemove(targets.sessionStorage, legacyKey);
};

export const clearPageSeoPanelCachesForSite = (
  targets: PageSeoPanelCacheTargets,
  siteId: string,
) => {
  const prefix = `${siteId.trim()}|`;
  if (!siteId.trim()) return;
  for (const cacheKey of pageSeoPanelMemoryCache.keys()) {
    if (cacheKey.startsWith(prefix)) pageSeoPanelMemoryCache.delete(cacheKey);
  }
  for (const storage of [targets.localStorage, targets.sessionStorage]) {
    if (!storage || typeof storage.key !== 'function' || typeof storage.length !== 'number') continue;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key?.(index) || '')
      .filter(key => (
        key.startsWith(`${PAGE_SEO_PANEL_CACHE_PREFIX}${prefix}`)
        || key.startsWith(`${PAGE_SEO_PANEL_LEGACY_SESSION_PREFIX}${prefix}`)
      ));
    keys.forEach(key => storageRemove(storage, key));
  }
};

export const formatPageSeoCacheAge = (savedAt: number, now = Date.now()) => {
  if (!Number.isFinite(savedAt)) return '';
  const elapsedMs = Math.max(0, now - savedAt);
  if (elapsedMs < 60_000) return '刚刚';
  if (elapsedMs < 60 * 60_000) return `${Math.floor(elapsedMs / 60_000)} 分钟前`;
  if (elapsedMs < 24 * 60 * 60_000) return `${Math.floor(elapsedMs / (60 * 60_000))} 小时前`;
  if (elapsedMs < 30 * 24 * 60 * 60_000) return `${Math.floor(elapsedMs / (24 * 60 * 60_000))} 天前`;
  return new Date(savedAt).toISOString().slice(0, 10);
};

export const resetPageSeoPanelCacheMemoryForTests = () => {
  pageSeoPanelMemoryCache.clear();
};
