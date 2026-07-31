import assert from 'node:assert/strict';
import test from 'node:test';

test('SEO diagnostics service fetches summary with days parameter', async () => {
  const service = await import('../../services/seoDiagnosticsService.ts');
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      updatedAt: '2026-05-29T00:00:00Z',
      dateRange: { startDate: '2026-05-02', endDate: '2026-05-29', days: 28 },
      totalPages: 1,
      highPriority: 1,
      mediumPriority: 0,
      lowPriority: 0,
      sourceWarnings: [],
      pages: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const summary = await service.fetchSeoDiagnosticsSummary(28);
    assert.equal(requestedUrl, '/api/seo-diagnostics/summary?days=28');
    assert.equal(summary.totalPages, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO diagnostics service rejects ok false refresh responses', async () => {
  const service = await import('../../services/seoDiagnosticsService.ts');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: false,
    detail: 'diagnostics source unavailable',
    updatedAt: '',
    dateRange: { startDate: '', endDate: '', days: 28 },
    totalPages: 0,
    highPriority: 0,
    mediumPriority: 0,
    lowPriority: 0,
    sourceWarnings: [],
    pages: [],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  try {
    await assert.rejects(
      () => service.refreshSeoDiagnostics(28),
      /diagnostics source unavailable/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO diagnostics service rejects malformed summary metrics', async () => {
  const service = await import('../../services/seoDiagnosticsService.ts');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    updatedAt: '2026-06-12T00:00:00Z',
    pages: [],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchSeoDiagnosticsSummary(28),
      /invalid totalPages/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO diagnostics service rejects summary pages with malformed source lists', async () => {
  const service = await import('../../services/seoDiagnosticsService.ts');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    updatedAt: '2026-06-12T00:00:00Z',
    dateRange: { startDate: '2026-05-16', endDate: '2026-06-12', days: 28 },
    totalPages: 1,
    highPriority: 1,
    mediumPriority: 0,
    lowPriority: 0,
    sourceWarnings: [],
    pages: [{
      id: 'page-1',
      url: 'https://example.com/page',
      path: '/page',
      pageRole: 'product',
      title: 'Product page',
      priority: 'high',
      issueType: 'content_gap',
      finding: 'Missing buyer content',
      evidence: [],
      sources: 'gsc',
      sourceGaps: [],
      aiExplanation: 'Add content to improve rankings.',
      recommendedActions: [],
      updatedAt: '2026-06-12T00:00:00Z',
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchSeoDiagnosticsSummary(28),
      /sources/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO diagnostics service rejects malformed explain page responses', async () => {
  const service = await import('../../services/seoDiagnosticsService.ts');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    url: 'https://example.com/page',
    path: '/page',
    title: 'Page',
    pageRole: 'unknown',
    priority: 'low',
    issueType: 'content_gap',
    finding: 'Missing diagnosis id',
    evidence: [],
    sources: [],
    sourceGaps: [],
    aiExplanation: '',
    recommendedActions: [],
    updatedAt: '2026-06-12T00:00:00Z',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  try {
    await assert.rejects(
      () => service.explainSeoDiagnosis('page', 28),
      /missing diagnosis id/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO diagnostics service rejects malformed page list rows and actions', async () => {
  const service = await import('../../services/seoDiagnosticsService.ts');
  const page = {
    id: 'page-1',
    url: 'https://example.com/page',
    path: '/page',
    pageRole: 'product',
    title: 'Product page',
    priority: 'high',
    issueType: 'content_gap',
    finding: 'Missing buyer content',
    evidence: [{ source: 'gsc', metric: 'impressions', value: 10, interpretation: 'Search visibility exists.' }],
    sources: ['gsc'],
    sourceGaps: [],
    aiExplanation: 'Add content to improve rankings.',
    recommendedActions: ['Add buyer FAQ'],
    nextWorkspace: { label: '打开 SEO 审计', viewMode: 'seoAudit', filter: 'category_collection' },
    updatedAt: '2026-06-12T00:00:00Z',
  };

  assert.throws(
    () => service.validateSeoDiagnosisPage({ ...page, sources: ['gsc', 42] } as any),
    /invalid source row/i,
  );
  assert.throws(
    () => service.validateSeoDiagnosisPage({ ...page, sourceGaps: [{ source: 'gsc' }] } as any),
    /invalid source gap/i,
  );
  assert.throws(
    () => service.validateSeoDiagnosisPage({
      ...page,
      evidence: [{ source: 'gsc', metric: 'impressions', value: 10, interpretation: { text: 'bad' } }],
    } as any),
    /invalid evidence row/i,
  );
  assert.throws(
    () => service.validateSeoDiagnosisPage({ ...page, recommendedActions: [{ label: 'Fix title' }] } as any),
    /invalid recommended action/i,
  );
  assert.throws(
    () => service.validateSeoDiagnosisPage({ ...page, nextWorkspace: { label: '打开 SEO 审计', viewMode: '' } } as any),
    /invalid next workspace/i,
  );
});
