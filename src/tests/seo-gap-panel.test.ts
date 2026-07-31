import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { saveBlogFormatPostCache } from '../blogFormatCache.ts';
import type { SeoGapItem } from '../../services/seoGapSearchService.ts';

const theme = {
  cardBg: 'bg-white',
  cardBorder: 'border-gray-200',
  subText: 'text-gray-500',
  heading: 'text-gray-900',
  inputBg: 'bg-gray-50',
  inputBorder: 'border-gray-300',
};

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

test('SEO gap panel shows product generation fields instead of a raw issue-code input', async () => {
  const panelModule = await import('../../components/SeoGapSearchPanel.tsx');
  const SeoGapSearchPanel = panelModule.SeoGapSearchPanel as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(SeoGapSearchPanel, {
    theme,
    initialType: 'product',
  }));

  assert.match(html, /生成字段/);
  assert.match(html, /简短描述/);
  assert.match(html, /描述/);
  assert.match(html, /AIOSEO 标题/);
  assert.match(html, /AIOSEO 描述/);
  assert.match(html, /全部产品（可选字段）/);
  assert.match(html, /使用已缓存扫描结果/);
  assert.match(html, /option value="product_manual_selection" selected=""/);
  assert.match(html, /标签为空/);
  assert.match(html, /SEO 不合理\/缺少/);
  assert.match(html, /核心关键词/);
  assert.doesNotMatch(html, /placeholder="输入核心关键词/);
  assert.match(html, /全选本页/);
  assert.match(html, /显示 0 \/ 共 0 条/);
  assert.doesNotMatch(html, /显示 0-0 \/ 共 0 条/);
  assert.match(html, /每页 10/);
  assert.match(html, /第 1 \/ 1 页/);
  assert.doesNotMatch(html, /问题代码，可留空/);
});

test('SEO gap panel exposes blog SEO, tag, and schema issue filters', async () => {
  const panelModule = await import('../../components/SeoGapSearchPanel.tsx');
  const SeoGapSearchPanel = panelModule.SeoGapSearchPanel as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(SeoGapSearchPanel, {
    theme,
    initialType: 'blog',
  }));

  assert.match(html, /SEO 不合理\/缺少/);
  assert.match(html, /缺标签/);
  assert.match(html, /缺博客 Schema/);
});

test('SEO gap panel can search Blog repair issues from the cached scan', async () => {
  const storage = new MemoryStorage();
  saveBlogFormatPostCache(storage, {
    status: 'publish',
    blogType: 'all',
    search: '',
    limit: 50,
    posts: [{
      id: 8517,
      title: 'Automatic Product Sample SEO Guide',
      slug: 'automatic-product-sample-seo-guide',
      status: 'publish',
      modified: '2026-05-16T10:00:00',
      link: 'https://example.com/automatic-product-sample-seo-guide/',
      summary: {
        wordCount: 1200,
        headingCount: 6,
        tableCount: 1,
        imageCount: 3,
        linkCount: 8,
        hasEditorFriendlyBlocks: true,
      },
      seoStatus: { state: 'missing', label: '缺 SEO' },
      tagStatus: { state: 'missing', label: '缺标签' },
      schemaStatus: { state: 'warning', label: 'Schema 需检查' },
      issueCodes: ['missing_seo_title', 'missing_tags', 'missing_faq_schema'],
    }],
    selectedIds: new Set([8517]),
    savedAt: Date.now(),
  });

  const panelModule = await import('../../components/SeoGapSearchPanel.tsx');
  const result = panelModule.searchCachedBlogSeoGaps(storage, {
    q: 'product sample',
    issue: 'missing_blog_tags',
    limit: 10,
    offset: 0,
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].type, 'blog');
  assert.equal(result.items[0].targetId, '8517');
  assert.deepEqual(result.items[0].suggestedFields, ['tags']);
  assert.deepEqual(result.items[0].issueLabels, ['缺标签']);
});

test('SEO gap tasks use selected product fields and the shared core keyword', async () => {
  const panelModule = await import('../../components/SeoGapSearchPanel.tsx');
  const task = panelModule.buildSeoGapTask({
    type: 'product',
    targetId: '1811',
    targetLabel: 'Demo Brand Product Sample',
    missingFields: ['short_description'],
    issueCodes: ['short_description_empty'],
    issueLabels: ['简短描述为空'],
    status: 'needs_attention',
    suggestedFields: ['short_description'],
  }, {
    fields: ['description', 'aioseo_description'],
    keyword: 'product sample',
  });

  assert.deepEqual(task.fields, ['description', 'aioseo_description']);
  assert.deepEqual(task.payload, {
    keyword: 'product sample',
    useShortDescriptionImages: false,
    useDetailSlices: true,
  });
});

test('SEO gap media tasks can request generated filenames for daily SEO', async () => {
  const panelModule = await import('../../components/SeoGapSearchPanel.tsx');

  assert.ok(
    panelModule.getSeoGapFieldOptions('media').some((option: { key: string }) => option.key === 'filename'),
  );
  assert.ok(panelModule.getDefaultSeoGapFields('media').includes('filename'));

  const task = panelModule.buildSeoGapTask({
    type: 'media',
    targetId: '9450',
    targetLabel: 'IMG_0001.JPG',
    previewImageUrl: 'https://example.com/uploads/IMG_0001.JPG',
    missingFields: ['alt_text'],
    issueCodes: ['alt_text_missing'],
    issueLabels: ['Alt 文本为空'],
    status: 'needs_attention',
    suggestedFields: ['alt_text'],
  }, {
    fields: ['filename', 'alt_text'],
    keyword: 'product sample',
  });

  assert.deepEqual(task.fields, ['filename', 'alt_text']);
  assert.deepEqual(task.payload, {
    keyword: 'product sample',
    useShortDescriptionImages: false,
    useDetailSlices: false,
    previewImageUrl: 'https://example.com/uploads/IMG_0001.JPG',
  });
});

test('SEO gap media tasks reject a missing core keyword', async () => {
  const panelModule = await import('../../components/SeoGapSearchPanel.tsx');

  assert.throws(
    () => panelModule.buildSeoGapTask({
      type: 'media',
      targetId: '9450',
      targetLabel: 'IMG_0001.JPG',
      missingFields: ['caption', 'description'],
      issueCodes: ['caption_missing', 'description_missing'],
      issueLabels: ['图片说明为空', '描述为空'],
      status: 'needs_attention',
      suggestedFields: ['caption', 'description'],
    }, {
      fields: ['caption', 'description'],
      keyword: '   ',
    }),
    /请输入核心关键词后再加入生成队列/,
  );
});

test('SEO gap panel routes generated unsynced media to direct sync instead of generation queue', async () => {
  const panelModule = await import('../../components/SeoGapSearchPanel.tsx');

  const generatedItem: SeoGapItem = {
    type: 'media',
    targetId: '9137',
    targetLabel: 'Demo Brand-Exihibition-at-Netherland-2024.webp',
    missingFields: [],
    issueCodes: ['generated_not_synced'],
    issueLabels: ['已生成未同步'],
    status: 'needs_attention',
    suggestedFields: [],
  };
  const missingItem: SeoGapItem = {
    type: 'media',
    targetId: '9201',
    targetLabel: 'enterprise-product-sample.jpg',
    missingFields: ['alt_text'],
    issueCodes: ['alt_text_missing'],
    issueLabels: ['Alt 文本为空'],
    status: 'needs_attention',
    suggestedFields: ['alt_text'],
  };

  const syncOnly = panelModule.buildSeoGapSelectionPlan([generatedItem]);
  assert.equal(syncOnly.syncCount, 1);
  assert.equal(syncOnly.generationCount, 0);
  assert.equal(panelModule.getSeoGapPrimaryActionLabel(syncOnly), '同步已生成 SEO (1)');

  const mixed = panelModule.buildSeoGapSelectionPlan([generatedItem, missingItem]);
  assert.equal(mixed.syncCount, 1);
  assert.equal(mixed.generationCount, 1);
  assert.equal(panelModule.getSeoGapPrimaryActionLabel(mixed), '生成/同步选中 (2)');
});

test('SEO gap panel renders media result preview thumbnails', async () => {
  const panelModule = await import('../../components/SeoGapSearchPanel.tsx');
  const SeoGapSearchPanel = panelModule.SeoGapSearchPanel as React.ComponentType<any>;
  const getSeoGapInspectionRows = panelModule.getSeoGapInspectionRows as (item: any) => Array<{ label: string; value: string }>;
  const item = {
    type: 'media',
    targetId: '9201',
    targetLabel: 'enterprise-product-sample.jpg',
    previewImageUrl: 'https://example.com/uploads/enterprise-product-sample.jpg',
    missingFields: ['alt_text'],
    issueCodes: ['alt_text_missing'],
    issueLabels: ['Alt 文本为空'],
    status: 'not_queued',
    suggestedFields: ['alt_text'],
    currentSeo: {
      title: 'enterprise product sample photo',
      alt_text: '',
      caption: '',
      description: 'Existing description',
    },
  };
  const html = renderToStaticMarkup(React.createElement(SeoGapSearchPanel, {
    theme,
    initialType: 'media',
    initialItems: [item],
    initialTotal: 1,
  }));

  const rows = getSeoGapInspectionRows(item);
  assert.deepEqual(rows.map(row => row.label), ['Alt 文本']);
  assert.equal(rows.find(row => row.label === 'Alt 文本')?.value, '为空');
  assert.match(html, /src="https:\/\/example\.com\/uploads\/enterprise-product-sample\.jpg"/);
  assert.match(html, /alt="enterprise-product-sample\.jpg"/);
  assert.match(html, /查看图片SEO/);
  assert.match(html, /核心关键词（必填，2–60 个字符）/);
  assert.doesNotMatch(html, /placeholder="输入核心关键词/);
});

test('SEO gap panel renders product result preview thumbnails', async () => {
  const panelModule = await import('../../components/SeoGapSearchPanel.tsx');
  const SeoGapSearchPanel = panelModule.SeoGapSearchPanel as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(SeoGapSearchPanel, {
    theme,
    initialType: 'product',
    initialItems: [{
      type: 'product',
      targetId: '1811',
      targetLabel: 'Demo Brand Product Sample',
      previewImageUrl: 'https://example.com/uploads/demo-brand-product-sample.jpg',
      missingFields: ['short_description'],
      issueCodes: ['product_manual_selection'],
      issueLabels: ['可手动选择字段'],
      status: 'not_queued',
      suggestedFields: ['short_description'],
    }],
    initialTotal: 1,
  }));

  assert.match(html, /src="https:\/\/example\.com\/uploads\/demo-brand-product-sample\.jpg"/);
  assert.match(html, /alt="Demo Brand Product Sample"/);
  assert.match(html, /Demo Brand Product Sample/);
});

test('SEO gap product tasks reject missing core keyword instead of using the target label', async () => {
  const panelModule = await import('../../components/SeoGapSearchPanel.tsx');

  assert.throws(
    () => panelModule.buildSeoGapTask({
      type: 'product',
      targetId: '1811',
      targetLabel: 'Demo Brand Product Sample',
      missingFields: ['short_description'],
      issueCodes: ['short_description_empty'],
      issueLabels: ['简短描述为空'],
      status: 'needs_attention',
      suggestedFields: ['short_description'],
    }, {
      fields: ['short_description'],
      keyword: '   ',
    }),
    /请输入核心关键词后再加入生成队列/,
  );
});

test('SEO gap search message distinguishes manual product selection from gaps', async () => {
  const panelModule = await import('../../components/SeoGapSearchPanel.tsx');

  assert.equal(
    panelModule.formatSeoGapSearchMessage('product', 'product_manual_selection', 198),
    '找到 198 个可选产品',
  );
  assert.equal(
    panelModule.formatSeoGapSearchMessage('product', 'full_description_empty', 36),
    '找到 36 条 SEO 空缺',
  );
});

test('SEO gap panel auto-loads cached search results on first mount', async () => {
  const source = await readFile(new URL('../../components/SeoGapSearchPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /autoLoadSearchRef/);
  assert.match(source, /runSearch\(1,\s*pageSize\)/);
});

test('SEO gap panel surfaces background task state and polls cache status while running', async () => {
  const source = await readFile(new URL('../../components/SeoGapSearchPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /SEO_GAP_CACHE_STATUS_POLL_MS\s*=\s*3000/);
  assert.match(source, /后台任务：\$\{cacheStatus\.task\.operation \|\| "运行中"\} 运行中/);
  assert.match(source, /后台任务失败：\$\{formatUserFacingError\(cacheStatus\.task\.lastError/);
  assert.match(source, /setInterval\(\(\) => \{\s*loadCacheStatus\(\);\s*\},\s*SEO_GAP_CACHE_STATUS_POLL_MS\)/);
  assert.match(source, /clearInterval\(intervalId\)/);
  assert.match(source, /\[cacheStatus\?\.task\.isRunning,\s*loadCacheStatus\]/);
});

test('SEO gap panel keeps Search cached and adds a separate latest refresh action', async () => {
  const source = await readFile(new URL('../../components/SeoGapSearchPanel.tsx', import.meta.url), 'utf8');
  const sliceAround = (anchor: string, before = 350, after = 350) => {
    const index = source.indexOf(anchor);
    assert.notEqual(index, -1);
    return source.slice(Math.max(0, index - before), index + anchor.length + after);
  };
  const refreshStart = source.indexOf('const refreshLatestSeoGaps = useCallback');
  const refreshEnd = source.indexOf('useEffect', refreshStart);
  assert.notEqual(refreshStart, -1);
  assert.notEqual(refreshEnd, -1);
  const refreshSource = source.slice(refreshStart, refreshEnd);
  const runSearchStart = source.indexOf('const runSearch = useCallback');
  assert.notEqual(runSearchStart, -1);
  const runSearchSource = source.slice(runSearchStart, refreshStart);
  const searchButtonSource = sliceAround('<IconRefresh className="size-4" /> 搜索', 450, 120);

  assert.match(source, /刷新最新问题/);
  assert.match(source, /fetchSeoGapCacheStatus/);
  assert.match(source, /图片缓存/);
  assert.match(source, /产品缓存/);
  assert.match(source, /博客：复用博客格式扫描缓存/);
  assert.match(source, /startSeoGapMediaRefresh/);
  assert.match(source, /startSeoGapProductRefresh/);
  assert.match(source, /fetchMediaOpsReport/);
  assert.match(source, /waitForRefreshIdle/);
  assert.match(source, /SEO_GAP_REFRESH_POLL_MS/);
  assert.match(source, /SEO_GAP_REFRESH_TIMEOUT_MS/);
  assert.match(source, /const performSeoGapSearch = useCallback/);
  assert.match(runSearchSource, /await performSeoGapSearch\(nextPage,\s*nextPageSize\)/);
  assert.match(source, /文章问题复用博客格式/);
  assert.match(source, /后台正在运行/);
  assert.match(source, /正在刷新媒体库/);
  assert.match(source, /正在刷新产品缓存/);
  assert.match(source, /已刷新最新问题/);
  assert.match(source, /刷新最新问题失败/);
  assert.doesNotMatch(source, /刷新最新问题流程将在下一步接入/);
  assert.match(refreshSource, /const warnings: string\[\] = \[\]/);
  assert.match(refreshSource, /warnings\.push\(warning\)/);
  assert.match(refreshSource, /warnings\.join\("；"\)/);
  assert.match(refreshSource, /await performSeoGapSearch\(1,\s*pageSize\)/);
  assert.doesNotMatch(refreshSource, /await runSearch\(1,\s*pageSize\)/);
  assert.match(searchButtonSource, /onClick=\{\(\) => runSearch\(1,\s*pageSize\)\}/);
  assert.match(searchButtonSource, /disabled=\{loading \|\| refreshingLatest\}/);
  assert.match(searchButtonSource, /搜索/);
  assert.doesNotMatch(searchButtonSource, /refreshLatestSeoGaps/);
  assert.match(source, /onClick=\{refreshLatestSeoGaps\}[\s\S]{0,500}刷新最新问题/);

  assert.match(sliceAround('placeholder="搜索产品名 / 图片文件名 / 文章标题 / ID"'), /disabled=\{loading \|\| refreshingLatest\}/);
  assert.match(sliceAround('aria-label="任务类型"'), /disabled=\{loading \|\| refreshingLatest\}/);
  assert.match(sliceAround('aria-label="问题类型"'), /disabled=\{loading \|\| refreshingLatest\}/);
  assert.match(sliceAround('onChange={event => toggleField(option.key, event.target.checked)}'), /disabled=\{loading \|\| refreshingLatest\}/);
  assert.match(sliceAround('aria-label="每页数量"'), /disabled=\{loading \|\| refreshingLatest\}/);
  assert.match(sliceAround('onClick={() => goToPage(page - 1)}'), /disabled=\{page <= 1 \|\| loading \|\| refreshingLatest\}/);
  assert.match(sliceAround('onClick={() => goToPage(page + 1)}'), /disabled=\{page >= totalPages \|\| loading \|\| refreshingLatest\}/);
  assert.match(sliceAround('全选本页', 500, 80), /disabled=\{!visibleKeys\.length \|\| loading \|\| refreshingLatest\}/);
  assert.match(sliceAround('aria-label={`选择 ${item.targetLabel}`}'), /disabled=\{loading \|\| refreshingLatest\}/);
});
