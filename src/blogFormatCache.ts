import type {
  BlogBulkFormatPost,
  BlogBulkFormatPostDetail,
  BlogRepairMode,
  BlogSchemaPreview,
} from '../services/blogPublishService';

export const BLOG_FORMAT_POST_CACHE_KEY = 'blogFormat.bulkFormat.posts.v1';
export const BLOG_FORMAT_POST_DETAIL_CACHE_KEY = 'blogFormat.bulkFormat.postDetails.v1';
export const BLOG_FORMAT_POST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type BlogFormatPostCacheStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

interface StoredBlogFormatPostCache {
  version: 1;
  siteKey?: string;
  status: string;
  blogType: string;
  search: string;
  limit: number;
  posts: BlogBulkFormatPost[];
  selectedIds: number[];
  savedAt: number;
}

interface StoredBlogFormatPostDetailCacheEntry {
  siteKey?: string;
  postId: number;
  repairMode: BlogRepairMode;
  detail: BlogBulkFormatPostDetail;
  savedAt: number;
}

interface StoredBlogFormatPostDetailCache {
  version: 1;
  details: Record<string, StoredBlogFormatPostDetailCacheEntry>;
}

export interface BlogFormatPostCacheSnapshot {
  siteKey?: string;
  status: string;
  blogType: string;
  search: string;
  limit: number;
  posts: BlogBulkFormatPost[];
  selectedIds: Set<number>;
  savedAt: number;
}

export interface BlogFormatPostDetailCacheSnapshot {
  siteKey?: string;
  postId: number;
  repairMode: BlogRepairMode;
  detail: BlogBulkFormatPostDetail;
  savedAt: number;
}

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const cleanString = (value: unknown) => (
  typeof value === 'string' ? value : ''
);

const normalizeSiteKey = (value: unknown) => cleanString(value).trim();

const cacheMatchesSite = (storedSiteKey: unknown, expectedSiteKey?: string) => {
  const expected = normalizeSiteKey(expectedSiteKey);
  if (!expected) return true;
  return normalizeSiteKey(storedSiteKey) === expected;
};

const cleanStringList = (value: unknown) => (
  Array.isArray(value) ? value.map(cleanString).filter(Boolean) : []
);

const cleanStringRecord = (value: unknown) => {
  if (!value || typeof value !== 'object') return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((fields, [key, fieldValue]) => {
    const cleanValue = cleanString(fieldValue);
    if (cleanValue) fields[key] = cleanValue;
    return fields;
  }, {});
};

const normalizeSeoStatus = (value: unknown): BlogBulkFormatPost['seoStatus'] => {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  const state = cleanString(row.state);
  const label = cleanString(row.label);
  const cleanState = ['ok', 'missing', 'unknown', 'warning'].includes(state)
    ? state as NonNullable<BlogBulkFormatPost['seoStatus']>['state']
    : 'unknown';
  if (!label && !state) return undefined;
  return {
    state: cleanState,
    label: label || '未扫描',
  };
};

const normalizeBlogSeo = (value: unknown): BlogBulkFormatPostDetail['seoBefore'] => {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  const seoTitle = cleanString(row.seoTitle);
  const seoDescription = cleanString(row.seoDescription);
  if (!seoTitle && !seoDescription) return undefined;
  return { seoTitle, seoDescription };
};

const normalizeSchemaPreview = (value: unknown): BlogSchemaPreview | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  const fields = cleanStringRecord(row.fields);
  return {
    schemaTypes: cleanStringList(row.schemaTypes),
    willWrite: cleanStringList(row.willWrite),
    readinessOnly: cleanStringList(row.readinessOnly),
    fields,
    warnings: cleanStringList(row.warnings),
  };
};

const normalizePost = (value: unknown): BlogBulkFormatPost | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const summary = row.summary;
  if (!isFiniteNumber(row.id) || !summary || typeof summary !== 'object') return null;
  const summaryRow = summary as Record<string, unknown>;

  const post: BlogBulkFormatPost = {
    id: row.id,
    title: cleanString(row.title),
    slug: cleanString(row.slug),
    status: cleanString(row.status),
    modified: cleanString(row.modified),
    link: cleanString(row.link),
    blogType: cleanString(row.blogType) || 'standard',
    blogTypeLabel: cleanString(row.blogTypeLabel) || '普通 Blog',
    summary: {
      wordCount: isFiniteNumber(summaryRow.wordCount) ? summaryRow.wordCount : 0,
      headingCount: isFiniteNumber(summaryRow.headingCount) ? summaryRow.headingCount : 0,
      tableCount: isFiniteNumber(summaryRow.tableCount) ? summaryRow.tableCount : 0,
      imageCount: isFiniteNumber(summaryRow.imageCount) ? summaryRow.imageCount : 0,
      linkCount: isFiniteNumber(summaryRow.linkCount) ? summaryRow.linkCount : 0,
      hasEditorFriendlyBlocks: summaryRow.hasEditorFriendlyBlocks === true,
    },
  };
  const seoStatus = normalizeSeoStatus(row.seoStatus);
  const tagStatus = normalizeSeoStatus(row.tagStatus);
  const schemaStatus = normalizeSeoStatus(row.schemaStatus);
  const contentStatus = normalizeSeoStatus(row.contentStatus);
  if (seoStatus) post.seoStatus = seoStatus;
  if (tagStatus) post.tagStatus = tagStatus;
  if (schemaStatus) post.schemaStatus = schemaStatus;
  if (contentStatus) post.contentStatus = contentStatus;

  const issueCodes = cleanStringList(row.issueCodes);
  const tagNames = cleanStringList(row.tagNames);
  const schemaTypes = cleanStringList(row.schemaTypes);
  if (issueCodes.length) post.issueCodes = issueCodes;
  if (tagNames.length) post.tagNames = tagNames;
  if (schemaTypes.length) post.schemaTypes = schemaTypes;

  const seoTitle = cleanString(row.seoTitle);
  const seoDescription = cleanString(row.seoDescription);
  if (seoTitle) post.seoTitle = seoTitle;
  if (seoDescription) post.seoDescription = seoDescription;

  const coreKeyword = cleanString(row.coreKeyword).trim();
  if (coreKeyword) post.coreKeyword = coreKeyword;

  return post;
};

const normalizePostDetail = (value: unknown): BlogBulkFormatPostDetail | null => {
  const post = normalizePost(value);
  if (!post || !value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.contentHtml !== 'string' || typeof row.excerpt !== 'string') return null;

  const detail: BlogBulkFormatPostDetail = {
    ...post,
    contentHtml: row.contentHtml,
    excerpt: row.excerpt,
  };

  const seoBefore = normalizeBlogSeo(row.seoBefore);
  const schemaPreview = normalizeSchemaPreview(row.schemaPreview);
  const tagsBefore = cleanStringList(row.tagsBefore);
  if (seoBefore) detail.seoBefore = seoBefore;
  if (tagsBefore.length) detail.tagsBefore = tagsBefore;
  if (schemaPreview) detail.schemaPreview = schemaPreview;

  return detail;
};

const normalizeSelectedIds = (value: unknown, posts: BlogBulkFormatPost[]): Set<number> => {
  const validPostIds = new Set(posts.map(post => post.id));
  const rawIds = Array.isArray(value) ? value : [];
  return new Set(
    rawIds
      .filter(isFiniteNumber)
      .filter(id => validPostIds.has(id)),
  );
};

const detailEntryKey = (postId: number, repairMode: BlogRepairMode) => `${repairMode}:${postId}`;

const readStoredDetailCache = (storage: BlogFormatPostCacheStorage): StoredBlogFormatPostDetailCache => {
  try {
    const raw = storage.getItem(BLOG_FORMAT_POST_DETAIL_CACHE_KEY);
    if (!raw) return { version: 1, details: {} };
    const parsed = JSON.parse(raw) as Partial<StoredBlogFormatPostDetailCache>;
    if (parsed.version !== 1 || !parsed.details || typeof parsed.details !== 'object') {
      return { version: 1, details: {} };
    }
    return {
      version: 1,
      details: parsed.details as Record<string, StoredBlogFormatPostDetailCacheEntry>,
    };
  } catch {
    return { version: 1, details: {} };
  }
};

const writeStoredDetailCache = (
  storage: BlogFormatPostCacheStorage,
  cache: StoredBlogFormatPostDetailCache,
) => {
  const keys = Object.keys(cache.details);
  if (!keys.length) {
    storage.removeItem(BLOG_FORMAT_POST_DETAIL_CACHE_KEY);
    return;
  }
  storage.setItem(BLOG_FORMAT_POST_DETAIL_CACHE_KEY, JSON.stringify(cache));
};

export const saveBlogFormatPostCache = (
  storage: BlogFormatPostCacheStorage,
  snapshot: BlogFormatPostCacheSnapshot,
) => {
  const stored: StoredBlogFormatPostCache = {
    version: 1,
    siteKey: normalizeSiteKey(snapshot.siteKey),
    status: snapshot.status,
    blogType: snapshot.blogType,
    search: snapshot.search,
    limit: snapshot.limit,
    posts: snapshot.posts,
    selectedIds: Array.from(snapshot.selectedIds),
    savedAt: snapshot.savedAt,
  };
  storage.setItem(BLOG_FORMAT_POST_CACHE_KEY, JSON.stringify(stored));
};

export const clearBlogFormatPostDetailCache = (storage: BlogFormatPostCacheStorage) => {
  storage.removeItem(BLOG_FORMAT_POST_DETAIL_CACHE_KEY);
};

export const clearBlogFormatSiteCache = (storage: BlogFormatPostCacheStorage, siteKey: string) => {
  const cleanSiteKey = normalizeSiteKey(siteKey);
  if (!cleanSiteKey) return;
  const belongsToSite = (value: unknown) => {
    const stored = normalizeSiteKey(value);
    return stored === cleanSiteKey || stored.startsWith(`${cleanSiteKey}::`);
  };
  try {
    const rawPosts = storage.getItem(BLOG_FORMAT_POST_CACHE_KEY);
    if (rawPosts) {
      const parsed = JSON.parse(rawPosts) as Partial<StoredBlogFormatPostCache>;
      if (belongsToSite(parsed.siteKey)) {
        storage.removeItem(BLOG_FORMAT_POST_CACHE_KEY);
      }
    }
  } catch {
    storage.removeItem(BLOG_FORMAT_POST_CACHE_KEY);
  }

  const detailCache = readStoredDetailCache(storage);
  detailCache.details = Object.fromEntries(
    Object.entries(detailCache.details).filter(([, entry]) => !belongsToSite(entry.siteKey)),
  );
  writeStoredDetailCache(storage, detailCache);
};

export const saveBlogFormatPostDetailCache = (
  storage: BlogFormatPostCacheStorage,
  snapshot: BlogFormatPostDetailCacheSnapshot,
) => {
  const detail = normalizePostDetail(snapshot.detail);
  if (!detail || detail.id !== snapshot.postId) return;

  const cache = readStoredDetailCache(storage);
  const freshDetails = Object.entries(cache.details).reduce<Record<string, StoredBlogFormatPostDetailCacheEntry>>(
    (details, [key, entry]) => {
      if (
        isFiniteNumber(entry?.savedAt)
        && snapshot.savedAt - entry.savedAt <= BLOG_FORMAT_POST_CACHE_TTL_MS
        && cacheMatchesSite(entry.siteKey, snapshot.siteKey)
      ) {
        details[key] = entry;
      }
      return details;
    },
    {},
  );

  freshDetails[detailEntryKey(snapshot.postId, snapshot.repairMode)] = {
    siteKey: normalizeSiteKey(snapshot.siteKey),
    postId: snapshot.postId,
    repairMode: snapshot.repairMode,
    detail,
    savedAt: snapshot.savedAt,
  };
  writeStoredDetailCache(storage, { version: 1, details: freshDetails });
};

export const loadBlogFormatPostDetailCache = (
  storage: BlogFormatPostCacheStorage,
  postId: number,
  repairMode: BlogRepairMode,
  now = Date.now(),
  expectedSiteKey = '',
): BlogFormatPostDetailCacheSnapshot | null => {
  const cache = readStoredDetailCache(storage);
  const key = detailEntryKey(postId, repairMode);
  const entry = cache.details[key];
  if (!entry) return null;
  if (!cacheMatchesSite(entry.siteKey, expectedSiteKey)) return null;

  const detail = normalizePostDetail(entry.detail);
  if (
    entry.postId !== postId
    || entry.repairMode !== repairMode
    || !isFiniteNumber(entry.savedAt)
    || !detail
  ) {
    delete cache.details[key];
    writeStoredDetailCache(storage, cache);
    return null;
  }

  if (now - entry.savedAt > BLOG_FORMAT_POST_CACHE_TTL_MS) {
    delete cache.details[key];
    writeStoredDetailCache(storage, cache);
    return null;
  }

  return {
    siteKey: normalizeSiteKey(entry.siteKey),
    postId,
    repairMode,
    detail,
    savedAt: entry.savedAt,
  };
};

export const loadBlogFormatPostCache = (
  storage: BlogFormatPostCacheStorage,
  now = Date.now(),
  expectedSiteKey = '',
): BlogFormatPostCacheSnapshot | null => {
  const raw = storage.getItem(BLOG_FORMAT_POST_CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredBlogFormatPostCache>;
    if (parsed.version !== 1 || !isFiniteNumber(parsed.savedAt)) {
      storage.removeItem(BLOG_FORMAT_POST_CACHE_KEY);
      return null;
    }
    if (now - parsed.savedAt > BLOG_FORMAT_POST_CACHE_TTL_MS) {
      storage.removeItem(BLOG_FORMAT_POST_CACHE_KEY);
      return null;
    }
    if (!cacheMatchesSite(parsed.siteKey, expectedSiteKey)) {
      storage.removeItem(BLOG_FORMAT_POST_CACHE_KEY);
      return null;
    }

    const posts = (Array.isArray(parsed.posts) ? parsed.posts : [])
      .map(normalizePost)
      .filter((post): post is BlogBulkFormatPost => Boolean(post));
    if (!posts.length) return null;

    return {
      siteKey: normalizeSiteKey(parsed.siteKey),
      status: cleanString(parsed.status) || 'publish',
      blogType: cleanString(parsed.blogType) || 'all',
      search: cleanString(parsed.search),
      limit: isFiniteNumber(parsed.limit) ? parsed.limit : 50,
      posts,
      selectedIds: normalizeSelectedIds(parsed.selectedIds, posts),
      savedAt: parsed.savedAt,
    };
  } catch {
    storage.removeItem(BLOG_FORMAT_POST_CACHE_KEY);
    return null;
  }
};
