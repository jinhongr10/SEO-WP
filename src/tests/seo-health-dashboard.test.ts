import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import type { SeoHealthSummary } from '../../services/seoHealthService.ts';

const theme = {
  cardBg: 'bg-white',
  cardBorder: 'border-gray-200',
  subText: 'text-gray-500',
  heading: 'text-gray-900',
  inputBg: 'bg-gray-50',
  inputBorder: 'border-gray-300',
};

const sampleSummary: SeoHealthSummary = {
  score: 76,
  label: '可优化',
  updatedAt: '2026-05-16T00:00:00Z',
  critical: 3,
  warningsCount: 5,
  notices: 2,
  generatedUnsynced: 4,
  groups: [
    {
      key: 'products',
      label: 'WooCommerce 产品',
      score: 52,
      labelStatus: '需要处理',
      total: 12,
      critical: 3,
      warnings: 5,
      notices: 1,
      available: true,
      summary: '3 个产品需要优先处理 SEO。',
    },
    {
      key: 'blog',
      label: '博客文章',
      score: 0,
      labelStatus: '严重',
      total: 0,
      critical: 0,
      warnings: 0,
      notices: 0,
      available: false,
      summary: '博客扫描失败：REST 接口被拦截。',
    },
  ],
  issues: [
    {
      id: 'products:101:aioseo_title',
      group: 'products',
      severity: 'critical',
      scoreImpact: 25,
      title: 'AIOSEO 标题缺失',
      detail: 'Product #101 没有自定义 SEO 标题。',
      targetId: 101,
      targetLabel: 'compact Product Sample',
      action: {
        label: '打开 WooCommerce',
        viewMode: 'productSeo',
        filter: 'aioseo_title_is_default_or_empty',
      },
    },
    {
      id: 'media:201:alt_text',
      group: 'media',
      severity: 'critical',
      scoreImpact: 25,
      title: '图片 Alt 文本缺失',
      detail: 'product-sample.webp 没有 Alt 文本。',
      targetId: 201,
      targetLabel: 'product-sample.webp',
      previewImageUrl: 'https://example.com/uploads/product-sample.webp',
      action: {
        label: '打开媒体 SEO',
        viewMode: 'mediaOps',
        filter: 'alt_text_missing',
      },
    },
    {
      id: 'blog:301:word_count',
      group: 'blog',
      severity: 'warning',
      scoreImpact: 10,
      title: '博客内容过薄',
      detail: 'Short guide 当前约 720 个词。',
      targetId: 301,
      targetLabel: 'Short Guide',
      action: {
        label: '打开博客格式',
        viewMode: 'blogFormat',
      },
    },
    {
      id: 'blog:302:blog_schema',
      group: 'blog',
      severity: 'warning',
      scoreImpact: 10,
      title: '博客 Schema 支持缺失',
      detail: 'Video guide 需要检查 FAQ 或 Video Schema 准备情况。',
      targetId: 302,
      targetLabel: 'Video Guide',
      action: {
        label: '打开博客修复',
        viewMode: 'blogFormat',
        filter: 'missing_blog_schema',
      },
    },
  ],
  warnings: ['博客扫描失败：REST 接口被拦截。'],
};

test('SEO health service fetches the summary with the requested blog limit', async () => {
  const service = await import('../../services/seoHealthService.ts');
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify(sampleSummary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const summary = await service.fetchSeoHealthSummary(25);

    assert.equal(requestedUrl, '/api/seo-health/summary?blog_limit=25&issue_limit=200');
    assert.equal(summary.score, 76);
    assert.equal(summary.groups[0].key, 'products');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO health service can request a forced summary refresh', async () => {
  const service = await import('../../services/seoHealthService.ts');
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify(sampleSummary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await service.fetchSeoHealthSummary(25, { forceRefresh: true });

    assert.equal(requestedUrl, '/api/seo-health/summary?blog_limit=25&issue_limit=200&force_refresh=true');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO health service can request a smaller first-screen issue payload', async () => {
  const service = await import('../../services/seoHealthService.ts');
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify(sampleSummary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await service.fetchSeoHealthSummary(25, { issueLimit: 50 });

    assert.equal(requestedUrl, '/api/seo-health/summary?blog_limit=25&issue_limit=50');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO health service can request cached background first-screen summary', async () => {
  const service = await import('../../services/seoHealthService.ts');
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify(sampleSummary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await service.fetchSeoHealthSummary(25, {
      preferCached: true,
      backgroundRefresh: true,
      issueLimit: 50,
    });

    assert.equal(requestedUrl, '/api/seo-health/summary?blog_limit=25&issue_limit=50&prefer_cached=true&background_refresh=true');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('command center defers summary fetching until backend is enabled', async () => {
  const source = await readFile(new URL('../../components/CommandCenterDashboard.tsx', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /enabled\?:\s*boolean/);
  assert.match(source, /if \(!enabled\) return/);
  assert.match(appSource, /<CommandCenterDashboard[\s\S]*enabled=\{desktopBackendReady\}/);
});

test('SEO health service localizes legacy English health text', async () => {
  const service = await import('../../services/seoHealthService.ts');
  const localized = service.validateSeoHealthSummary({
    ...sampleSummary,
    label: 'Can Improve',
    groups: [
      {
        ...sampleSummary.groups[0],
        label: 'WooCommerce Products',
        labelStatus: 'Needs Work',
        summary: '3 products need urgent SEO attention.',
      },
    ],
    issues: [
      {
        ...sampleSummary.issues[2],
        title: 'Blog content is thin',
        detail: 'Short guide has only 720 words.',
        action: {
          label: 'Open Blog Format',
          viewMode: 'blogFormat',
        },
      },
    ],
    warnings: [
      'Product health scan failed: no such table: product_items',
      'Blog scan failed: Missing WordPress credentials. Please set wpUrl/wpUser/wpAppPass in settings first.',
    ],
  });

  assert.equal(localized.label, '可优化');
  assert.equal(localized.groups[0].label, 'WooCommerce 产品');
  assert.equal(localized.groups[0].labelStatus, '需要处理');
  assert.equal(localized.groups[0].summary, '3 个产品需要优先处理 SEO。');
  assert.equal(localized.issues[0].title, '博客内容过薄');
  assert.equal(localized.issues[0].detail, 'Short guide 只有 720 个词。');
  assert.equal(localized.issues[0].action?.label, '打开博客格式');
  assert.match(localized.warnings[0], /产品健康检查失败：本地产品缓存表还未初始化/);
  assert.match(localized.warnings[1], /博客扫描失败：缺少 WordPress 连接信息/);
});

test('SEO health service accepts pending cached summary metadata', async () => {
  const service = await import('../../services/seoHealthService.ts');
  const summary = service.validateSeoHealthSummary({
    ...sampleSummary,
    pending: true,
    cacheStatus: {
      source: 'persisted',
      stale: true,
      refreshRunning: true,
      lastRunAt: '2026-06-27T10:00:00Z',
      lastError: '',
    },
  });

  assert.equal(summary.pending, true);
  assert.equal(summary.cacheStatus?.source, 'persisted');
  assert.equal(summary.cacheStatus?.stale, true);
  assert.equal(summary.cacheStatus?.refreshRunning, true);
});

test('SEO health service rejects ok false summary responses', async () => {
  const service = await import('../../services/seoHealthService.ts');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: false,
    detail: 'Blog scan failed: Missing WordPress credentials. Please set wpUrl/wpUser/wpAppPass in settings first.',
    score: 0,
    label: 'Critical',
    updatedAt: '',
    critical: 0,
    warningsCount: 0,
    notices: 0,
    generatedUnsynced: 0,
    groups: [],
    issues: [],
    warnings: [],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchSeoHealthSummary(25),
      /博客扫描失败：缺少 WordPress 连接信息/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO health service rejects malformed summary responses', async () => {
  const service = await import('../../services/seoHealthService.ts');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    score: 76,
    label: 'Can Improve',
    updatedAt: '2026-06-12T00:00:00Z',
    critical: 3,
    warningsCount: 5,
    notices: 2,
    generatedUnsynced: 4,
    warnings: [],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchSeoHealthSummary(25),
      /missing groups/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO health service rejects malformed top-level display fields', async () => {
  const service = await import('../../services/seoHealthService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response(JSON.stringify({
    ...sampleSummary,
    label: { text: 'Can Improve' },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchSeoHealthSummary(25),
      /invalid label/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = (async () => new Response(JSON.stringify({
    ...sampleSummary,
    critical: 'many',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchSeoHealthSummary(25),
      /invalid critical/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO health service rejects malformed group and issue rows', async () => {
  const service = await import('../../services/seoHealthService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response(JSON.stringify({
    ...sampleSummary,
    groups: [{ ...sampleSummary.groups[0], key: '', score: 50 }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchSeoHealthSummary(25),
      /invalid group/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = (async () => new Response(JSON.stringify({
    ...sampleSummary,
    issues: [{ ...sampleSummary.issues[0], severity: 'urgent' }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchSeoHealthSummary(25),
      /invalid issue/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO health service rejects malformed warning entries and issue action fields', async () => {
  const service = await import('../../services/seoHealthService.ts');

  assert.throws(
    () => service.validateSeoHealthSummary({
      ...sampleSummary,
      warnings: ['Blog scan failed', { detail: 'REST blocked' }],
    } as any),
    /invalid warning/i,
  );
  assert.throws(
    () => service.validateSeoHealthSummary({
      ...sampleSummary,
      issues: [{ ...sampleSummary.issues[0], title: { rendered: 'AIOSEO title is missing' } }],
    } as any),
    /invalid issue/i,
  );
  assert.throws(
    () => service.validateSeoHealthSummary({
      ...sampleSummary,
      issues: [{ ...sampleSummary.issues[0], action: { label: 'Open WooCommerce', viewMode: '' } }],
    } as any),
    /invalid issue action/i,
  );
  assert.throws(
    () => service.validateSeoHealthSummary({
      ...sampleSummary,
      issues: [{ ...sampleSummary.issues[1], previewImageUrl: 42 }],
    } as any),
    /previewImageUrl/i,
  );
});

test('command center dashboard renders scores, unavailable groups, and issue actions', async () => {
  const dashboardModule = await import('../../components/CommandCenterDashboard.tsx');
  const CommandCenterDashboard = dashboardModule.CommandCenterDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(CommandCenterDashboard, {
    theme,
    initialSummary: sampleSummary,
    onNavigate: () => undefined,
  }));

  assert.match(html, /中控台/);
  assert.match(html, /统一任务中心/);
  assert.match(html, /任务来源/);
  assert.match(html, /站内自扫/);
  assert.match(html, /SEO 审计导入/);
  assert.match(html, /手动选择/);
  assert.match(html, /所有生成结果都会进入统一审核队列/);
  assert.match(html, /自动化只生成草稿，不自动上传/);
  assert.match(html, /产品详情描述需要先上传产品图片/);
  assert.match(html, /图片 SEO 草稿也需要审核/);
  assert.match(html, /76/);
  assert.match(html, /站点 SEO 健康度/);
  assert.match(html, /更新时间/);
  assert.match(html, /WooCommerce 产品/);
  assert.match(html, /博客扫描失败：REST 接口被拦截/);
  assert.match(html, /先配置 WordPress/);
  assert.match(html, /data-view-mode="settings:wordpress"/);
  assert.match(html, /AIOSEO 标题缺失/);
  assert.match(html, /compact Product Sample/);
  assert.match(html, /紧急/);
  assert.match(html, /data-view-mode="productSeo"/);
  assert.match(html, /打开 WooCommerce/);
  assert.match(html, /src="https:\/\/example\.com\/uploads\/product-sample\.webp"/);
  assert.match(html, /alt="product-sample\.webp"/);
  assert.match(html, /博客 Schema 支持缺失/);
  assert.match(html, /data-view-mode="blogFormat"/);
  assert.match(html, /data-filter="missing_blog_schema"/);
  assert.match(html, /打开博客修复/);
  assert.match(html, /内容类型/);
  assert.match(html, /严重程度/);
  assert.match(html, /问题类型/);
  assert.match(html, /每页 20/);
  assert.match(html, /上一页/);
  assert.match(html, /下一页/);
  assert.match(html, /class="[^"]*control-page[^"]*"/);
  assert.match(html, /class="[^"]*homepage-panel[^"]*"/);
  assert.match(html, /class="[^"]*control-metric-card[^"]*"/);
  assert.match(html, /class="[^"]*control-filter-bar[^"]*"/);
  assert.match(html, /class="[^"]*homepage-table[^"]*"/);
  assert.match(html, /class="[^"]*command-center-issue-table-shell[^"]*"/);
  assert.match(html, /class="[^"]*command-center-issue-table[^"]*"/);
  assert.match(html, /class="[^"]*command-center-action-cell[^"]*"/);
  assert.match(html, /class="[^"]*ui-table[^"]*"/);
  assert.match(html, /class="[^"]*command-center-group-card[^"]*"/);
  assert.match(html, /class="[^"]*command-center-severity-stat[^"]*"/);
  assert.match(html, /class="[^"]*command-center-health-score[^"]*"/);
  assert.match(html, /class="[^"]*command-center-group-action[^"]*"/);
  assert.match(html, /class="[^"]*command-center-row-action[^"]*"/);
  assert.match(html, /优先处理队列/);
});

test('command center uses recent Blog Format scan cache when health summary still has stale blog failure', async () => {
  const dashboardModule = await import('../../components/CommandCenterDashboard.tsx');
  const cache = {
    status: 'publish',
    blogType: 'all',
    search: '',
    limit: 50,
    selectedIds: new Set([901]),
    savedAt: Date.parse('2026-05-16T00:10:00Z'),
    posts: [
      {
        id: 901,
        title: 'How to Choose a Product Sample Guide',
        slug: 'product-sample-guide',
        status: 'publish',
        modified: '2026-05-16T00:09:00Z',
        link: 'https://example.com/product-sample-guide/',
        blogType: 'standard',
        blogTypeLabel: '普通 Blog',
        summary: {
          wordCount: 420,
          headingCount: 1,
          tableCount: 0,
          imageCount: 0,
          linkCount: 0,
          hasEditorFriendlyBlocks: false,
        },
        issueCodes: ['missing_seo_title', 'missing_tags', 'missing_faq_schema'],
      },
    ],
  };

  assert.equal(dashboardModule.shouldForceRefreshForBlogFormatCache(sampleSummary, cache), true);

  const patched = dashboardModule.applyBlogFormatCacheFallback(sampleSummary, cache);
  const blogGroup = patched.groups.find((group: any) => group.key === 'blog');

  assert.equal(blogGroup?.available, true);
  assert.equal(blogGroup?.total, 1);
  assert.equal(blogGroup?.critical, 1);
  assert.equal(patched.updatedAt, '2026-05-16T00:10:00.000Z');
  assert.ok(patched.issues.some((issue: any) => issue.id === 'blog:901:word_count'));
  assert.ok(patched.issues.some((issue: any) => issue.title === '博客 Schema 支持缺失'));
  assert.ok(patched.warnings.some((warning: string) => /博客格式扫描缓存/.test(warning)));
  assert.equal(patched.warnings.some((warning: string) => /REST 接口被拦截/.test(warning)), false);
});

test('command center styles keep stat cells and action button text centered', async () => {
  const { readFile } = await import('node:fs/promises');
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

  assert.match(styles, /\.command-center-severity-stat\s*\{[\s\S]*align-items:\s*center[\s\S]*justify-content:\s*center/);
  assert.match(styles, /\.command-center-health-score\s*\{[\s\S]*max-width:\s*100%[\s\S]*font-size:\s*clamp\(/);
  assert.match(styles, /\.command-center-group-card\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
  assert.match(styles, /\.system-workspace \.arco-btn:not\(\.arco-btn-icon-only\) \.arco-btn-content/);
  assert.match(styles, /\.command-center-group-action\.ui-button,[\s\S]*\.command-center-row-action\.ui-button,[\s\S]*\.command-center-pagination-action\.ui-button/);
  assert.match(styles, /\.command-center-issue-table-shell\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(styles, /\.homepage-table\.command-center-issue-table-shell\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(styles, /\.command-center-issue-table\s*\{[\s\S]*min-width:\s*1120px/);
  assert.match(styles, /\.command-center-action-cell\s*\{[\s\S]*position:\s*sticky[\s\S]*right:\s*0/);
});

test('command center knowledge stats count reviewed usable materials instead of raw uploads', async () => {
  const dashboardModule = await import('../../components/CommandCenterDashboard.tsx');

  const stats = dashboardModule.getUsableKnowledgeStats({
    knowledgeSources: [
      ...Array.from({ length: 5 }, (_, index) => ({ id: `company-${index}`, sourceType: 'company' })),
      ...Array.from({ length: 5 }, (_, index) => ({ id: `product-${index}`, sourceType: 'product' })),
      ...Array.from({ length: 10 }, (_, index) => ({ id: `keyword-${index}`, sourceType: 'keyword' })),
    ],
    knowledgeArtifacts: [
      { id: 'draft-company', kind: 'company', status: 'draft', markdown: 'pending company facts' },
      { id: 'empty-product', kind: 'product', status: 'reviewed', markdown: '   ' },
      { id: 'archived-keyword', kind: 'keyword', status: 'archived', markdown: 'product sample' },
    ],
    faqs: [{ id: 'faq-draft', status: 'draft' }],
    linkIndex: [],
  } as any);

  assert.deepEqual(stats, {
    company: 0,
    product: 0,
    keyword: 0,
  });
});

test('command center dashboard renders immediately without initial data', async () => {
  const dashboardModule = await import('../../components/CommandCenterDashboard.tsx');
  const CommandCenterDashboard = dashboardModule.CommandCenterDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(CommandCenterDashboard, {
    theme,
    onNavigate: () => undefined,
  }));

  assert.match(html, /统一任务中心/);
  assert.match(html, /站点资料/);
  assert.match(html, /正在后台生成首次健康数据|正在刷新中控台数据/);
  assert.doesNotMatch(html, /正在加载中控台/);
});

test('command center lazy-loads secondary task panels', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../components/CommandCenterDashboard.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /import \{ DailySeoQueuePanel \} from "\.\/DailySeoQueuePanel"/);
  assert.doesNotMatch(source, /import \{ SeoGapSearchPanel \} from "\.\/SeoGapSearchPanel"/);
  assert.match(source, /lazy\(\(\) => import\("\.\/DailySeoQueuePanel"\)/);
  assert.match(source, /lazy\(\(\) => import\("\.\/SeoGapSearchPanel"\)/);
});

test('command center initial summary load uses cached background refresh, while manual refresh forces latest data', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../components/CommandCenterDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /fetchSeoHealthSummary\(50,\s*\{\s*preferCached:\s*true,\s*backgroundRefresh:\s*true,\s*issueLimit:\s*50\s*\}\)/);
  assert.match(source, /loadSummary\(\{\s*forceRefresh:\s*true\s*\}\)/);
  assert.doesNotMatch(source, /shouldForceRefreshForBlogFormatCache\(nextSummary,\s*cache\)[\s\S]{0,240}forceRefresh:\s*true/);
});

test('command center issue helpers filter by group, severity, and issue type', async () => {
  const dashboardModule = await import('../../components/CommandCenterDashboard.tsx');

  const filtered = dashboardModule.filterSeoHealthIssues(sampleSummary.issues, {
    group: 'media',
    severity: 'critical',
    issueType: '图片 Alt 文本缺失',
  });

  assert.deepEqual(filtered.map((issue: any) => issue.id), ['media:201:alt_text']);
});

test('command center issue action navigation includes target context', async () => {
  const dashboardModule = await import('../../components/CommandCenterDashboard.tsx');
  const mediaIssue = sampleSummary.issues[1];
  const navigation = dashboardModule.buildSeoHealthActionNavigation(mediaIssue.action, mediaIssue);

  assert.deepEqual(navigation, {
    mode: 'mediaOps',
    options: {
      filter: 'alt_text_missing',
      targetId: 201,
      targetLabel: 'product-sample.webp',
      issueId: 'media:201:alt_text',
      issueTitle: '图片 Alt 文本缺失',
    },
  });
});

test('command center issue pagination returns current page bounds', async () => {
  const dashboardModule = await import('../../components/CommandCenterDashboard.tsx');
  const issues = Array.from({ length: 45 }, (_, index) => ({
    ...sampleSummary.issues[0],
    id: `products:${index}:aioseo_title`,
    targetId: index,
  }));

  const page = dashboardModule.paginateSeoHealthIssues(issues, 3, 20);

  assert.equal(page.total, 45);
  assert.equal(page.totalPages, 3);
  assert.equal(page.page, 3);
  assert.equal(page.start, 41);
  assert.equal(page.end, 45);
  assert.equal(page.items.length, 5);
});
