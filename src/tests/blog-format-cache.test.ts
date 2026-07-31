import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BLOG_FORMAT_POST_CACHE_KEY,
  BLOG_FORMAT_POST_CACHE_TTL_MS,
  clearBlogFormatSiteCache,
  clearBlogFormatPostDetailCache,
  loadBlogFormatPostDetailCache,
  loadBlogFormatPostCache,
  saveBlogFormatPostDetailCache,
  saveBlogFormatPostCache,
} from '../blogFormatCache.ts';

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

const samplePost = {
  id: 8517,
  title: 'Automatic vs Manual',
  slug: 'automatic-vs-manual',
  status: 'publish',
  modified: '2026-05-16T10:00:00',
  link: 'https://example.com/automatic-vs-manual/',
  summary: {
    wordCount: 1200,
    headingCount: 6,
    tableCount: 1,
    imageCount: 3,
    linkCount: 8,
    hasEditorFriendlyBlocks: false,
  },
};

const sampleDetail = {
  ...samplePost,
  contentHtml: '<p>Cached article body</p>',
  excerpt: 'Cached excerpt',
  seoBefore: {
    seoTitle: 'Cached SEO title',
    seoDescription: 'Cached SEO description',
  },
  tagsBefore: ['product sample'],
  schemaPreview: {
    schemaTypes: ['Article'],
    willWrite: ['Article'],
    readinessOnly: [],
    fields: {
      headline: 'Automatic vs Manual',
    },
    warnings: [],
  },
};

test('bulk Blog format scan results round-trip through local storage', () => {
  const storage = new MemoryStorage();

  saveBlogFormatPostCache(storage, {
    status: 'publish',
    blogType: 'exhibition',
    search: '',
    limit: 50,
    posts: [samplePost],
    selectedIds: new Set([8517]),
    savedAt: 1778904000000,
  });

  const restored = loadBlogFormatPostCache(storage, 1778904000000 + 1000);

  assert.equal(storage.getItem(BLOG_FORMAT_POST_CACHE_KEY)?.includes('Automatic vs Manual'), true);
  assert.equal(restored?.status, 'publish');
  assert.equal(restored?.blogType, 'exhibition');
  assert.equal(restored?.posts.length, 1);
  assert.equal(restored?.selectedIds.has(8517), true);
});

test('bulk Blog format cache keeps SEO repair issue details', () => {
  const storage = new MemoryStorage();

  saveBlogFormatPostCache(storage, {
    status: 'publish',
    blogType: 'all',
    search: '',
    limit: 50,
    posts: [{
      ...samplePost,
      seoStatus: { state: 'missing', label: '缺 SEO' },
      tagStatus: { state: 'missing', label: '缺 Tags' },
      schemaStatus: { state: 'warning', label: 'Schema 需检查' },
      issueCodes: ['missing_seo_title', 'missing_tags', 'missing_faq_schema'],
      seoTitle: 'Generated SEO title',
      seoDescription: 'Generated SEO description',
      tagNames: ['product sample'],
      schemaTypes: ['FAQPage'],
    }],
    selectedIds: new Set([8517]),
    savedAt: 1778904000000,
  });

  const restored = loadBlogFormatPostCache(storage, 1778904000000 + 1000);
  const post = restored?.posts[0];

  assert.equal(post?.seoStatus?.label, '缺 SEO');
  assert.equal(post?.tagStatus?.state, 'missing');
  assert.equal(post?.schemaStatus?.label, 'Schema 需检查');
  assert.deepEqual(post?.issueCodes, ['missing_seo_title', 'missing_tags', 'missing_faq_schema']);
  assert.equal(post?.seoTitle, 'Generated SEO title');
  assert.deepEqual(post?.tagNames, ['product sample']);
  assert.deepEqual(post?.schemaTypes, ['FAQPage']);
});

test('bulk Blog format cache keeps per-post core keywords', () => {
  const storage = new MemoryStorage();

  saveBlogFormatPostCache(storage, {
    status: 'publish',
    blogType: 'all',
    search: '',
    limit: 50,
    posts: [{
      ...samplePost,
      coreKeyword: ' product sample ',
    }],
    selectedIds: new Set([8517]),
    savedAt: 1778904000000,
  });

  const restored = loadBlogFormatPostCache(storage, 1778904000000 + 1000);

  assert.equal(restored?.posts[0].coreKeyword, 'product sample');
});

test('bulk Blog format cache drops blank per-post core keywords', () => {
  const storage = new MemoryStorage();
  storage.setItem(BLOG_FORMAT_POST_CACHE_KEY, JSON.stringify({
    version: 1,
    status: 'publish',
    blogType: 'all',
    search: '',
    limit: 50,
    posts: [{
      ...samplePost,
      coreKeyword: '   ',
    }],
    selectedIds: [8517],
    savedAt: 1778904000000,
  }));

  const restored = loadBlogFormatPostCache(storage, 1778904000000 + 1000);

  assert.equal(restored?.posts[0].coreKeyword, undefined);
});

test('bulk Blog format scan cache expires instead of showing stale WordPress data', () => {
  const storage = new MemoryStorage();

  saveBlogFormatPostCache(storage, {
    status: 'publish',
    blogType: 'all',
    search: '',
    limit: 50,
    posts: [samplePost],
    selectedIds: new Set([8517]),
    savedAt: 1778904000000,
  });

  const restored = loadBlogFormatPostCache(
    storage,
    1778904000000 + BLOG_FORMAT_POST_CACHE_TTL_MS + 1,
  );

  assert.equal(restored, null);
  assert.equal(storage.getItem(BLOG_FORMAT_POST_CACHE_KEY), null);
});

test('bulk Blog format scan cache is scoped to the active site', () => {
  const storage = new MemoryStorage();

  saveBlogFormatPostCache(storage, {
    siteKey: 'site-a::https://a.example',
    status: 'publish',
    blogType: 'all',
    search: '',
    limit: 50,
    posts: [samplePost],
    selectedIds: new Set([8517]),
    savedAt: 1778904000000,
  });

  const restoredForSameSite = loadBlogFormatPostCache(
    storage,
    1778904000000 + 1000,
    'site-a::https://a.example',
  );
  assert.equal(restoredForSameSite?.posts.length, 1);

  const restoredForOtherSite = loadBlogFormatPostCache(
    storage,
    1778904000000 + 1000,
    'site-b::https://b.example',
  );
  assert.equal(restoredForOtherSite, null);
  assert.equal(storage.getItem(BLOG_FORMAT_POST_CACHE_KEY), null);
});

test('bulk Blog format detail cache round-trips per post and repair mode', () => {
  const storage = new MemoryStorage();

  saveBlogFormatPostDetailCache(storage, {
    postId: 8517,
    repairMode: 'seo',
    detail: sampleDetail,
    savedAt: 1778904000000,
  });
  saveBlogFormatPostDetailCache(storage, {
    postId: 8517,
    repairMode: 'content',
    detail: {
      ...sampleDetail,
      excerpt: 'Content mode cached excerpt',
    },
    savedAt: 1778904000000,
  });

  const seoDetail = loadBlogFormatPostDetailCache(storage, 8517, 'seo', 1778904000000 + 1000);
  const contentDetail = loadBlogFormatPostDetailCache(storage, 8517, 'content', 1778904000000 + 1000);

  assert.equal(seoDetail?.detail.contentHtml, '<p>Cached article body</p>');
  assert.equal(seoDetail?.detail.seoBefore?.seoTitle, 'Cached SEO title');
  assert.deepEqual(seoDetail?.detail.schemaPreview?.schemaTypes, ['Article']);
  assert.equal(contentDetail?.detail.excerpt, 'Content mode cached excerpt');
});

test('bulk Blog format detail cache is scoped to the active site', () => {
  const storage = new MemoryStorage();

  saveBlogFormatPostDetailCache(storage, {
    siteKey: 'site-a::https://a.example',
    postId: 8517,
    repairMode: 'seo',
    detail: sampleDetail,
    savedAt: 1778904000000,
  });

  const sameSite = loadBlogFormatPostDetailCache(
    storage,
    8517,
    'seo',
    1778904000000 + 1000,
    'site-a::https://a.example',
  );
  const otherSite = loadBlogFormatPostDetailCache(
    storage,
    8517,
    'seo',
    1778904000000 + 1000,
    'site-b::https://b.example',
  );

  assert.equal(sameSite?.detail.title, 'Automatic vs Manual');
  assert.equal(otherSite, null);
});

test('bulk Blog format detail cache expires with the scan cache TTL', () => {
  const storage = new MemoryStorage();

  saveBlogFormatPostDetailCache(storage, {
    postId: 8517,
    repairMode: 'seo',
    detail: sampleDetail,
    savedAt: 1778904000000,
  });

  const restored = loadBlogFormatPostDetailCache(
    storage,
    8517,
    'seo',
    1778904000000 + BLOG_FORMAT_POST_CACHE_TTL_MS + 1,
  );

  assert.equal(restored, null);
});

test('bulk Blog format detail cache can be cleared after a fresh scan', () => {
  const storage = new MemoryStorage();

  saveBlogFormatPostDetailCache(storage, {
    postId: 8517,
    repairMode: 'seo',
    detail: sampleDetail,
    savedAt: 1778904000000,
  });

  clearBlogFormatPostDetailCache(storage);

  assert.equal(loadBlogFormatPostDetailCache(storage, 8517, 'seo', 1778904000000 + 1000), null);
});

test('deleting a site clears only matching Blog format browser state', () => {
  const storage = new MemoryStorage();
  saveBlogFormatPostCache(storage, {
    siteKey: 'site-a::https://a.example.com',
    status: 'publish',
    blogType: 'all',
    search: '',
    limit: 50,
    posts: [samplePost],
    selectedIds: new Set([samplePost.id]),
    savedAt: 1_000,
  });

  clearBlogFormatSiteCache(storage, 'site-a');

  assert.equal(storage.getItem(BLOG_FORMAT_POST_CACHE_KEY), null);
});
