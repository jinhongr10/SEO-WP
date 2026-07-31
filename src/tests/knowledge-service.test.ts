import assert from 'node:assert/strict';
import test from 'node:test';

test('knowledge service lists uploaded sources', async () => {
  const service = await import('../../services/knowledgeService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      sources: [
        {
          id: 'src_1',
          filename: 'brand-guide.md',
          contentType: 'text/markdown',
          size: 42,
          chars: 38,
          createdAt: '2026-06-20T00:00:00Z',
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    const sources = await service.fetchKnowledgeSources('/custom-api');
    assert.equal(sources[0].filename, 'brand-guide.md');
    assert.equal(sources[0].chars, 38);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('knowledge service imports files with form data and hides backend detail', async () => {
  const service = await import('../../services/knowledgeService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ detail: 'Unsupported knowledge file type: .zip' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const file = new File(['bad'], 'archive.zip', { type: 'application/zip' });
    await assert.rejects(
      () => service.importKnowledgeFiles([file], '/custom-api'),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /操作失败/);
        assert.doesNotMatch(error.message, /Unsupported knowledge file type/);
        assert.match(String((error as Error & { technicalDetails?: string }).technicalDetails), /Unsupported knowledge file type/);
        return true;
      },
    );
    assert.equal(calls[0].url, '/custom-api/knowledge/import');
    assert.equal(calls[0].init?.method, 'POST');
    assert.ok(calls[0].init?.body instanceof FormData);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
