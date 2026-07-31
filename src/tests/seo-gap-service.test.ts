import assert from 'node:assert/strict';
import test from 'node:test';

const withMockFetch = async (
  handler: (url: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
  run: () => Promise<void>,
) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

test('SEO gap search service encodes filters and returns valid paged results', async () => {
  const service = await import('../../services/seoGapSearchService.ts');
  let requestedUrl = '';

  await withMockFetch(
    async (url) => {
      requestedUrl = String(url);
      return jsonResponse({ items: [], total: 0, limit: 25, offset: 50 });
    },
    async () => {
      const result = await service.searchSeoGaps({
        q: 'product sample',
        type: 'product',
        issue: 'short_description_empty',
        limit: 25,
        offset: 50,
      });

      assert.equal(result.limit, 25);
    },
  );

  assert.equal(
    requestedUrl,
    '/api/seo-gaps/search?q=product+sample&type=product&issue=short_description_empty&limit=25&offset=50',
  );
});

test('SEO gap search service rejects ok false and malformed search results', async () => {
  const service = await import('../../services/seoGapSearchService.ts');

  await withMockFetch(
    async () => jsonResponse({
      ok: false,
      detail: 'gap index unavailable',
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    }),
    async () => {
      await assert.rejects(
        () => service.searchSeoGaps(),
        /gap index unavailable/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({
      total: 1,
      limit: 10,
      offset: 0,
    }),
    async () => {
      await assert.rejects(
        () => service.searchSeoGaps(),
        /missing items/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({
      items: [],
      total: '1',
      limit: 10,
      offset: 0,
    }),
    async () => {
      await assert.rejects(
        () => service.searchSeoGaps(),
        /invalid total/i,
      );
    },
  );
});

test('SEO gap search service rejects malformed gap items before task creation', async () => {
  const service = await import('../../services/seoGapSearchService.ts');

  await withMockFetch(
    async () => jsonResponse({
      items: [
        {
          type: 'unknown',
          targetId: '',
          targetLabel: '',
          missingFields: 'title',
          issueCodes: [],
          issueLabels: [],
          status: 'not_queued',
          suggestedFields: [],
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    }),
    async () => {
      await assert.rejects(
        () => service.searchSeoGaps(),
        /invalid seo gap item/i,
      );
    },
  );
});

test('SEO gap search service rejects non-string gap field arrays', async () => {
  const service = await import('../../services/seoGapSearchService.ts');

  await withMockFetch(
    async () => jsonResponse({
      items: [
        {
          type: 'product',
          targetId: '1811',
          targetLabel: 'Demo Brand Product Sample',
          missingFields: ['short_description'],
          issueCodes: ['short_description_empty'],
          issueLabels: ['短描述为空'],
          status: 'not_queued',
          suggestedFields: [{ field: 'short_description' }],
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    }),
    async () => {
      await assert.rejects(
        () => service.searchSeoGaps(),
        /suggestedFields/i,
      );
    },
  );
});

test('SEO gap search service preserves media preview image URLs', async () => {
  const service = await import('../../services/seoGapSearchService.ts');

  await withMockFetch(
    async () => jsonResponse({
      items: [
        {
          type: 'media',
          targetId: '9201',
          targetLabel: 'enterprise-product-sample.jpg',
          previewImageUrl: 'https://example.com/uploads/enterprise-product-sample.jpg',
          missingFields: ['alt_text'],
          issueCodes: ['alt_text_missing'],
          issueLabels: ['Alternative Text 为空'],
          status: 'not_queued',
          suggestedFields: ['alt_text'],
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    }),
    async () => {
      const result = await service.searchSeoGaps({ type: 'media' });

      assert.equal(result.items[0].previewImageUrl, 'https://example.com/uploads/enterprise-product-sample.jpg');
    },
  );
});

test('SEO gap search service rejects malformed media preview image URLs', async () => {
  const service = await import('../../services/seoGapSearchService.ts');

  await withMockFetch(
    async () => jsonResponse({
      items: [
        {
          type: 'media',
          targetId: '9201',
          targetLabel: 'enterprise-product-sample.jpg',
          previewImageUrl: 42,
          missingFields: ['alt_text'],
          issueCodes: ['alt_text_missing'],
          issueLabels: ['Alternative Text 为空'],
          status: 'not_queued',
          suggestedFields: ['alt_text'],
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    }),
    async () => {
      await assert.rejects(
        () => service.searchSeoGaps({ type: 'media' }),
        /previewImageUrl/i,
      );
    },
  );
});
