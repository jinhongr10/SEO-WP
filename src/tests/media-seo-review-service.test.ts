import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('media SEO review service hides API detail when update fails', async () => {
  const service = await import('../../services/mediaSeoReviewService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ detail: 'SEO review item not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.updateMediaSeoReview(999, { review_status: 'approved' }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /操作失败/);
        assert.doesNotMatch(error.message, /SEO review item not found/);
        assert.match(String((error as Error & { technicalDetails?: string }).technicalDetails), /SEO review item not found/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media SEO review service rejects ok false update responses', async () => {
  const service = await import('../../services/mediaSeoReviewService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ ok: false, updated: 0, detail: 'SEO review update was not persisted' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.updateMediaSeoReview(123, { review_status: 'approved' }),
      /SEO review update was not persisted/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media SEO review service rejects zero-update success responses', async () => {
  const service = await import('../../services/mediaSeoReviewService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ ok: true, updated: 0, detail: 'No media SEO review rows updated' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.updateMediaSeoReview(123, { review_status: 'approved' }),
      /No media SEO review rows updated|no rows were updated/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media SEO review service posts batch review updates', async () => {
  const service = await import('../../services/mediaSeoReviewService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, updated: 2 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await service.batchUpdateMediaSeoReview([1, 2], 'approved');

    assert.deepEqual(result, { ok: true, updated: 2 });
    assert.equal(calls[0].url, '/api/media/seo-review/batch');
    assert.equal(calls[0].init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      ids: [1, 2],
      review_status: 'approved',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media SEO review service rejects ok false batch update responses', async () => {
  const service = await import('../../services/mediaSeoReviewService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ ok: false, updated: 0, message: 'No review rows updated' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.batchUpdateMediaSeoReview([1, 2], 'approved'),
      /No review rows updated/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media SEO review service rejects zero-update batch responses', async () => {
  const service = await import('../../services/mediaSeoReviewService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ ok: true, updated: 0, message: 'No review rows updated' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.batchUpdateMediaSeoReview([1, 2], 'approved'),
      /No review rows updated|no rows were updated/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media SEO draft service hides API detail when saving a field draft fails', async () => {
  const service = await import('../../services/mediaSeoReviewService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ detail: 'Invalid filename draft' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => service.saveMediaSeoDraft(9450, { filename: 'bad name.jpg', generator: 'ai-field' }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /操作失败/);
        assert.doesNotMatch(error.message, /Invalid filename draft/);
        assert.match(String((error as Error & { technicalDetails?: string }).technicalDetails), /Invalid filename draft/);
        return true;
      },
    );

    assert.equal(calls[0].url, '/api/media/9450/seo-draft');
    assert.equal(calls[0].init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      filename: 'bad name.jpg',
      generator: 'ai-field',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media SEO draft service rejects ok false save responses', async () => {
  const service = await import('../../services/mediaSeoReviewService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ ok: false, item: null, error: 'Draft row was not saved' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.saveMediaSeoDraft(9450, { filename: 'product-sample.webp', generator: 'ai-field' }),
      /Draft row was not saved/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media apply SEO rejects success-looking response with no generated SEO rows', async () => {
  const service = await import('../../services/mediaSeoReviewService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      applied: 0,
      detail: 'No generated SEO data found for the given IDs',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.applyMediaSeo({ media_ids: [9450], fields: ['alt_text'] }),
      /No generated SEO data/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media apply SEO rejects when every WordPress sync failed', async () => {
  const service = await import('../../services/mediaSeoReviewService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      applied: 0,
      skipped: 0,
      errors: [{ media_id: 9450, detail: 'Forbidden' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.applyMediaSeo({ ids: [1], fields: ['alt_text'] }),
      /Forbidden|failed/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media apply SEO rejects ok false responses even when rows were applied', async () => {
  const service = await import('../../services/mediaSeoReviewService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      applied: 1,
      failed: 1,
      detail: 'WordPress media SEO sync failed after partial update',
      errors: [{ media_id: 77, detail: 'REST metadata update failed' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.applyMediaSeo({ ids: [77], fields: ['title', 'alt_text'] }),
      /WordPress media SEO sync failed after partial update/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media apply SEO service hides raw HTTP text while preserving technical details', async () => {
  const service = await import('../../services/mediaSeoReviewService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response('WordPress REST API unavailable', {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'text/plain' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => service.applyMediaSeo({ ids: [101, 102], fields: ['title', 'alt_text'] }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /WordPress 接口暂时不可用/);
        assert.doesNotMatch(error.message, /WordPress REST API unavailable/);
        assert.match(String((error as Error & { technicalDetails?: string }).technicalDetails), /WordPress REST API unavailable/);
        return true;
      },
    );

    assert.equal(calls[0].url, '/api/media/apply-seo');
    assert.equal(calls[0].init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      ids: [101, 102],
      fields: ['title', 'alt_text'],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media ops dashboard uses checked review service calls for SEO review updates', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /fetch\(`\/api\/media\/seo-review\/\$\{/);
  assert.doesNotMatch(source, /fetch\('\/api\/media\/seo-review\/batch'/);
});

test('media ops dashboard uses checked draft service for single-field drafts', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /saveMediaSeoDraft\(item\.id,/);
  assert.doesNotMatch(source, /fetch\(`\/api\/media\/\$\{item\.id\}\/seo-draft`/);
});

test('media ops dashboard lets expanded media SEO drafts be edited before review sync', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /draftSeoEdits/);
  assert.match(source, /handleSaveMediaFieldDraft\(item, field\.key\)/);
  assert.match(source, /value=\{draftValue\}/);
  assert.match(source, /onChange=\{e => updateMediaDraftField\(item\.id, field\.key, e\.target\.value\)\}/);
});

test('media review restores the saved core keyword and shows actually used table keywords', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');
  assert.match(source, /item\.keywordUsage\?\.coreKeyword/);
  assert.match(source, /实际采用词表词/);
  assert.match(source, /item\.keywordUsage\?\.usedKeywords/);
  assert.doesNotMatch(source, /manualKeywords\[item\.id\]\?\.trim\(\) \|\| item\.category_detected/);
});

test('backend image SEO endpoints allow an optional core-keyword contract', async () => {
  const source = await readFile(new URL('../../backend/main.py', import.meta.url), 'utf8');

  assert.match(source, /def _optional_image_seo_core_keyword\(value: Any\) -> str:/);
  assert.match(source, /core_keyword = _optional_image_seo_core_keyword\(mainKeyword\)/);
  assert.match(source, /main_keyword = _optional_image_seo_core_keyword\(payload\.mainKeyword\)/);
});

test('media ops dashboard uses checked apply SEO service for WordPress sync', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /applyMediaSeo\(\{\s*ids,/);
  assert.match(source, /applyMediaSeo\(\{\s*media_ids: idsToApply,/);
  assert.doesNotMatch(source, /fetch\('\/api\/media\/apply-seo'/);
});

test('media ops uses the site knowledge library instead of a separate upload entry', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /uploadMediaKeywords|fetchMediaKeywords|clearMediaKeywords|ArcoUpload/);
  assert.doesNotMatch(source, /上传关键词表|查看词表|清除词表/);
  assert.match(source, /产品词库类目/);
});
