import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('AI status service throws probe detail when AI probe returns ok false', async () => {
  const service = await import('../../services/aiStatusService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      provider: 'vertex',
      model: 'gemini-2.5-flash',
      detail: 'Service account JSON file not found: /app/keys/vertex-sa.json',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.probeAiStatus(),
      /Service account JSON file not found/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI status service localizes non-json probe failures and preserves details', async () => {
  const service = await import('../../services/aiStatusService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response('Gateway exploded while probing AI', { status: 502, statusText: 'Bad Gateway' })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.probeAiStatus(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /操作失败/);
        assert.doesNotMatch(error.message, /Gateway exploded while probing AI/);
        assert.match(String((error as Error & { technicalDetails?: string }).technicalDetails), /Gateway exploded while probing AI/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI status service rejects successful probe responses missing provider metadata', async () => {
  const service = await import('../../services/aiStatusService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      probeOk: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.probeAiStatus(),
      /AI status response missing provider/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI status service rejects malformed boolean status fields before display', async () => {
  const service = await import('../../services/aiStatusService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: 'false',
      provider: 'vertex',
      configured: 'yes',
      credentialsFileExists: 'missing',
      model: 'gemini-2.5-flash',
      probeOk: 'true',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchAiStatus(),
      /AI status response has invalid ok/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI status service accepts verified probe metadata', async () => {
  const service = await import('../../services/aiStatusService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      provider: 'vertex',
      configured: true,
      verified: true,
      probeAgeSeconds: 4,
      model: 'gemini-2.5-flash',
      probeOk: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    const status = await service.fetchAiStatus();
    assert.equal(status.configured, true);
    assert.equal(status.verified, true);
    assert.equal(status.probeAgeSeconds, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('App uses checked AI status service for status and probe calls', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /fetchAiStatus\(\)/);
  assert.match(source, /probeAiStatus\(\)/);
  assert.doesNotMatch(source, /fetch\('\/api\/ai\/status/);
});

test('App distinguishes configured AI from verified AI connection in the sidebar', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /aiConnectionVerified/);
  assert.match(source, /AI 已验证/);
  assert.match(source, /AI 已配置/);
  assert.doesNotMatch(source, /hasApiKeyConfigured\s*\?\s*'AI 已连接'/);
});
