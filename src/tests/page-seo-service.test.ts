import assert from 'node:assert/strict';
import test from 'node:test';

test('page SEO service lists WordPress pages through the Pages endpoint only', async () => {
  const service = await import('../../services/pageSeoService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      items: [{
        id: 42,
        title: 'About Demo Brand',
        slug: 'about-demo-brand',
        link: 'https://example.com/about-demo-brand/',
        status: 'publish',
        modified: '2026-06-17T00:00:00',
        currentSeoTitle: 'About Demo Brand',
        currentMetaDescription: 'Commercial deployment site product manufacturer.',
        contentPreview: 'Demo Brand manufactures deployment site products.',
        source: 'pages',
      }],
      total: 1,
      warnings: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await service.fetchPageSeoPages({ status: 'publish', search: 'demo-brand', limit: 25 }, '/custom-api');

    assert.equal(calls[0].url, '/custom-api/page-seo/pages?status=publish&search=demo-brand&limit=25');
    assert.doesNotMatch(calls[0].url, /wc\/v3|WooCommerce/i);
    assert.equal(result.items[0].id, 42);
    assert.equal(result.items[0].currentSeoTitle, 'About Demo Brand');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page SEO service can list WooCommerce product category archive pages separately', async () => {
  const service = await import('../../services/pageSeoService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      items: [{
        id: 9,
        title: 'Product Sample',
        slug: 'product-sample',
        link: 'https://example.com/product-category/product-sample/',
        status: 'publish',
        modified: '',
        currentSeoTitle: 'Product Sample Manufacturer',
        currentMetaDescription: 'Browse product sample categories.',
        contentPreview: 'compact and automatic product sample category.',
        source: 'product_categories',
      }],
      total: 1,
      warnings: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await service.fetchPageSeoItems({ source: 'product_categories', search: 'sample', limit: 25 }, '/custom-api');

    assert.equal(calls[0].url, '/custom-api/page-seo/items?source=product_categories&search=sample&limit=25');
    assert.doesNotMatch(calls[0].url, /wc\/v3\/products(?:\?|$)/i);
    assert.equal(result.items[0].source, 'product_categories');
    assert.equal(result.items[0].title, 'Product Sample');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page SEO service forwards abort signals to list requests', async () => {
  const service = await import('../../services/pageSeoService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const controller = new AbortController();

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      items: [],
      total: 0,
      warnings: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    await service.fetchPageSeoItems({ source: 'pages', limit: 10 }, '/custom-api', { signal: controller.signal });

    assert.equal(calls[0].url, '/custom-api/page-seo/items?source=pages&status=publish&limit=10');
    assert.ok(calls[0].init?.signal instanceof AbortSignal);
    assert.equal(calls[0].init?.signal?.aborted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page SEO service posts field-scoped generation and sync requests to page SEO endpoints', async () => {
  const service = await import('../../services/pageSeoService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/generate')) {
      return new Response(JSON.stringify({
        items: [{
          id: 42,
          seoTitle: 'Demo Brand deployment site Manufacturer',
          metaDescription: 'Learn about Demo Brand deployment site product manufacturing and B2B supply capabilities.',
        }],
        warnings: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      ok: true,
      updated: [{ id: 42, plugin: 'rank_math' }],
      errors: [],
      warnings: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    await service.generatePageSeo({
      pages: [{
        id: 42,
        title: 'About Demo Brand',
        slug: 'about-demo-brand',
        link: 'https://example.com/about-demo-brand/',
        status: 'publish',
        modified: '2026-06-17T00:00:00',
        currentSeoTitle: '',
        currentMetaDescription: '',
        contentPreview: 'Demo Brand manufactures deployment site products.',
        source: 'pages',
      }],
      source: 'pages',
      fields: ['seoTitle'],
      keywordContext: 'deployment site manufacturer',
      companyContext: 'Demo Brand factory context',
    }, '/custom-api');
    await service.syncPageSeoItems({
      plugin: 'rank_math',
      source: 'pages',
      items: [{
        id: 42,
        seoTitle: 'Demo Brand deployment site Manufacturer',
        metaDescription: 'Learn about Demo Brand deployment site product manufacturing and B2B supply capabilities.',
        source: 'pages',
      }],
    }, '/custom-api');

    assert.equal(calls[0].url, '/custom-api/page-seo/generate');
    assert.equal(calls[1].url, '/custom-api/page-seo/sync');
    assert.doesNotMatch(calls.map(call => call.url).join('\n'), /wc\/v3|WooCommerce/i);
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)).fields, ['seoTitle']);
    assert.equal(JSON.parse(String(calls[0].init?.body)).keywordContext, 'deployment site manufacturer');
    assert.equal(JSON.parse(String(calls[1].init?.body)).plugin, 'rank_math');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page SEO service posts copy optimization requests to the page SEO copy endpoint', async () => {
  const service = await import('../../services/pageSeoService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      items: [{
        id: 9,
        source: 'product_categories',
        summary: 'Add category copy and route buyers to related categories.',
        targetSections: [{
          section: 'Buying Guide',
          placement: 'After intro',
          optimizedCopy: 'Choose a product sample by installation surface and service workflow.',
          keywordsUsed: ['product sample'],
        }],
        internalLinks: [{
          type: 'category',
          title: 'Product Sample',
          url: 'https://example.com/product-category/product-sample/',
          anchorText: 'product sample options',
          placement: 'Buying Guide',
          reason: 'Supports category comparison.',
          html: '<a href="https://example.com/product-category/product-sample/">product sample options</a>',
        }],
      }],
      warnings: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await service.generatePageSeoCopyOptimization({
      source: 'product_categories',
      pages: [{
        id: 9,
        title: 'Product Sample',
        slug: 'product-sample',
        link: 'https://example.com/product-category/product-sample/',
        status: 'publish',
        modified: '',
        currentSeoTitle: '',
        currentMetaDescription: '',
        contentPreview: 'Product sample category.',
        source: 'product_categories',
      }],
      keywordContext: 'product sample',
    }, '/custom-api');

    assert.equal(calls[0].url, '/custom-api/page-seo/optimize-copy');
    assert.equal(JSON.parse(String(calls[0].init?.body)).source, 'product_categories');
    assert.equal(result.items[0].targetSections[0].section, 'Buying Guide');
    assert.equal(result.items[0].internalLinks[0].html.includes('/blog/'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page SEO service rejects malformed copy optimization responses', async () => {
  const service = await import('../../services/pageSeoService.ts');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [{ id: 9, summary: 'Missing sections and links' }],
      warnings: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.generatePageSeoCopyOptimization({
        pages: [],
      }),
      /invalid page SEO copy optimization/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page SEO service rejects malformed page rows before rendering', async () => {
  const service = await import('../../services/pageSeoService.ts');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [{ id: 42, title: '', link: 'https://example.com/about-demo-brand/' }],
      total: 1,
      warnings: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchPageSeoPages(),
      /invalid page SEO item/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
