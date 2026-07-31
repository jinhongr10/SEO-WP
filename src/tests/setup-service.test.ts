import assert from 'node:assert/strict';
import test from 'node:test';

test('setup service validates setup status checks', async () => {
  const service = await import('../../services/setupService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      registered: true,
      setupComplete: false,
      siteCreated: false,
      checks: [
        { key: 'account', ok: true, label: '本机账户', detail: '本机账户已创建。' },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    const status = await service.fetchSetupStatus('/custom-api');
    assert.equal(status.registered, true);
    assert.equal(status.siteCreated, false);
    assert.equal(status.checks[0].key, 'account');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('setup service validates SEO plugin probe response', async () => {
  const service = await import('../../services/setupService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      detectedPlugin: 'rank_math',
      confidence: 'high',
      canWrite: true,
      writeMode: 'rest_meta',
      titleKey: 'rank_math_title',
      descriptionKey: 'rank_math_description',
      namespaces: ['wp/v2', 'rankmath/v1'],
      scores: { rank_math: 7 },
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    const probe = await service.probeSeoPlugin('/custom-api');
    assert.equal(probe.detectedPlugin, 'rank_math');
    assert.equal(probe.canWrite, true);
    assert.equal(probe.titleKey, 'rank_math_title');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
