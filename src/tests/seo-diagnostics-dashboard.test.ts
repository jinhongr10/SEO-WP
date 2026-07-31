import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SeoDiagnosticsSummary } from '../../services/seoDiagnosticsService.ts';

const theme = {
  cardBg: 'bg-white',
  cardBorder: 'border-gray-200',
  subText: 'text-gray-500',
  heading: 'text-gray-900',
  inputBg: 'bg-gray-50',
  inputBorder: 'border-gray-300',
};

const sampleSummary: SeoDiagnosticsSummary = {
  updatedAt: '2026-05-29T00:00:00Z',
  dateRange: { startDate: '2026-05-02', endDate: '2026-05-29', days: 28 },
  totalPages: 1,
  highPriority: 1,
  mediumPriority: 0,
  lowPriority: 0,
  sourceWarnings: [],
  pages: [{
    id: 'example.com/product-category/product-sample:search_visibility_low_ctr',
    url: 'https://example.com/product-category/product-sample/',
    path: '/product-category/product-sample/',
    pageRole: 'product_category',
    title: 'Product Sample',
    priority: 'high',
    issueType: 'search_visibility_low_ctr',
    finding: '分类页有搜索曝光但点击率偏低',
    evidence: [
      { source: 'gsc', metric: 'impressions', value: 2000, interpretation: '衡量页面在搜索结果里的曝光机会。' },
    ],
    sources: ['gsc', 'woocommerce', 'seo_audit'],
    sourceGaps: [],
    aiExplanation: 'GSC 显示该分类页有曝光但 CTR 偏低，建议优化标题描述。',
    recommendedActions: ['优化分类页 SEO 标题和描述', '补充选购指南、对比说明和 FAQ'],
    nextWorkspace: { label: '打开 SEO 审计', viewMode: 'seoAudit', filter: 'category_collection' },
    updatedAt: '2026-05-29T00:00:00Z',
  }],
};

test('SEO diagnostics dashboard renders operations queue and evidence', async () => {
  const module = await import('../../components/SeoDiagnosticsDashboard.tsx');
  const Dashboard = module.SeoDiagnosticsDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(Dashboard, {
    theme,
    initialSummary: sampleSummary,
    backendUrl: '/api',
  }));

  assert.match(html, /数据洞察/);
  assert.match(html, /SEO 效果分析/);
  assert.match(html, /Product Sample/);
  assert.match(html, /分类页有搜索曝光但点击率偏低/);
  assert.doesNotMatch(html, /GA4/);
  assert.match(html, /GSC/);
  assert.match(html, /打开 SEO 审计/);
});

test('SEO diagnostics dashboard keeps the diagnostics list usable beside the detail panel', async () => {
  const module = await import('../../components/SeoDiagnosticsDashboard.tsx');
  const Dashboard = module.SeoDiagnosticsDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(Dashboard, {
    theme,
    initialSummary: sampleSummary,
    backendUrl: '/api',
  }));

  assert.match(html, /2xl:grid-cols-\[minmax\(0,1fr\)_minmax\(340px,0\.38fr\)\]/);
  assert.match(html, /min-w-0 overflow-hidden rounded-lg/);
  assert.match(html, /table-fixed/);
  assert.match(html, /break-words/);
});

test('SEO diagnostics helpers filter by role and priority', async () => {
  const module = await import('../../components/SeoDiagnosticsDashboard.tsx');
  const filtered = module.filterSeoDiagnosticsPages(sampleSummary.pages, {
    role: 'product_category',
    priority: 'high',
    sourceGap: 'gsc',
    search: 'commercial',
  });
  assert.equal(filtered.length, 0);
});
